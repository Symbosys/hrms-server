import crypto from "crypto";
import type { NextFunction, Request, Response } from "express";
import env from "../../../config/env.config.ts";
import { prisma } from "../../../db/prisma.ts";
import { asyncHandler } from "../../../middlewares/error.middleware.ts";
import { statusCode } from "../../../types/types.ts";
import { generateOTP, signToken } from "../../../utils/jwt.util.ts";
import { ErrorResponse, SuccessResponse } from "../../../utils/response.util.ts";
import {
    loginSchema,
    registerSchema,
    sendOtpSchema,
    verifyOtpSchema,
} from "../validators/auth.validator.ts";

/**
 * Hash password using Node.js native crypto module (SHA256)
 */
const hashPassword = (password: string): string => {
  return crypto.createHash("sha256").update(password).digest("hex");
};

/**
 * Compare plain password with hashed password
 */
const comparePassword = (password: string, hashed: string): boolean => {
  return hashPassword(password) === hashed;
};

/**
 * Utility to set auth cookie on response
 */
const setAuthCookie = (res: Response, token: string) => {
  res.cookie("token", token, {
    httpOnly: true,
    secure: env.server.nodeEnv === "production",
    sameSite: "strict",
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  });
};

/**
 * Helper to get the user's active membership with org-scoped role and organizationId
 */
const getActiveMembership = async (userId: string) => {
  const membership = await prisma.membership.findFirst({
    where: { userId, status: "ACTIVE" },
    include: {
      organizations: true,
      role: {
        include: {
          permissions: true,
        },
      },
    },
  });
  return membership;
};

/**
 * Helper to link or create employee record for the authenticated user based on their phone number
 */
const linkOrCreateEmployeeForUser = async (user: any, organizationId?: string) => {
  // 1. Resolve user's role from user object, roleId, or active membership
  let roleName = user.role?.name;
  if (!roleName && user.roleId) {
    try {
      const roleObj = await prisma.role.findUnique({ where: { id: user.roleId } });
      roleName = roleObj?.name;
    } catch (_) {}
  }
  if (!roleName && user.id) {
    try {
      const membership = await prisma.membership.findFirst({
        where: { userId: user.id, status: "ACTIVE" },
        include: { role: true },
      });
      roleName = membership?.role?.name;
    } catch (_) {}
  }

  const roleUpper = String(roleName || "").toUpperCase();
  const isAdminOrOrg =
    roleUpper === "SUPER_ADMIN" ||
    roleUpper === "ORGANIZATION ADMIN" ||
    roleUpper === "ADMIN" ||
    roleUpper === "SUPER ADMIN" ||
    roleUpper === "HR_ADMIN" ||
    (user.name && user.name.startsWith("Admin -")) ||
    user.email === "info@symbosys.com";

  if (isAdminOrOrg) {
    // Organization Admins belong to users and memberships tables, NOT operational employees table.
    // Ensure any previously created fake employee record for this admin is cleaned up.
    try {
      await prisma.employee.deleteMany({
        where: {
          OR: [
            { userId: user.id },
            ...(user.email ? [{ email: { equals: user.email, mode: "insensitive" as const } }] : []),
          ],
        },
      });
    } catch (e: any) {
      console.warn("[Auth] Notice cleaning admin from employee records:", e.message);
    }
    return null;
  }

  let employee: any = null;
  try {
    employee = await prisma.employee.findUnique({
      where: { userId: user.id },
    });
  } catch (err: any) {
    console.warn(`[Auth Controller] Error finding employee by userId:`, err.message || err);
  }

  if (!employee) {
    // 2. Try to find employee by matching email or phone number
    if (user.email) {
      employee = await prisma.employee.findFirst({
        where: { email: user.email },
      });
    }

    if (!employee) {
      const cleanUserPhone = user.phone ? user.phone.replace(/\D/g, '') : '';
      if (cleanUserPhone) {
        const allEmployees = await prisma.employee.findMany();
        employee = allEmployees.find(emp => {
          if (!emp.phone) return false;
          const cleanEmpPhone = emp.phone.replace(/\D/g, '');
          return cleanUserPhone.endsWith(cleanEmpPhone) || cleanEmpPhone.endsWith(cleanUserPhone);
        }) || null;
      }
    }

    if (employee) {
      // Link the existing onboarded employee to this user account
      const updateData: any = { userId: user.id };
      if (organizationId && !employee.organizationId) {
        updateData.organizationId = organizationId;
      }
      employee = await prisma.employee.update({
        where: { id: employee.id },
        data: updateData
      });
      console.log(`[Auth] Linked existing onboarded employee ${employee.id} to user ${user.id}`);
    } else {
      // 3. Create a brand new employee record linked to this user
      const empCount = await prisma.employee.count();
      const empId = `EMP${String(empCount + 1).padStart(3, '0')}`;
      const empName = user.name || `Employee ${empId}`;
      const empEmail = user.email || `${empId.toLowerCase()}@symbosys.com`;

      employee = await prisma.employee.create({
        data: {
          id: empId,
          name: empName,
          email: empEmail,
          phone: user.phone,
          status: "ACTIVE",
          joiningDate: new Date(),
          userId: user.id,
          organizationId: organizationId || null,
        }
      });
      console.log(`[Auth] Created brand new employee ${empId} for user ${user.id}`);
    }
  } else {
    // Employee exists but may not have organizationId set
    if (organizationId && !employee.organizationId) {
      employee = await prisma.employee.update({
        where: { id: employee.id },
        data: { organizationId }
      });
    }
  }

  // 4. Sync name and email from employee to user if they are empty
  if (employee && (!user.name || !user.email)) {
    const emailToSet = user.email || employee.email;
    let emailExists = false;
    if (emailToSet) {
      const existingUserWithEmail = await prisma.user.findUnique({
        where: { email: emailToSet }
      });
      if (existingUserWithEmail && existingUserWithEmail.id !== user.id) {
        emailExists = true;
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        name: user.name || employee.name,
        email: emailExists ? undefined : emailToSet,
      },
      include: { role: true }
    });
    // Update local user object fields
    Object.assign(user, updatedUser);
  }

  return employee;
};

/**
 * @desc    Send OTP to user's phone number
 * @route   POST /api/v1/auth/send-otp
 * @access  Public
 */
export const sendOtp = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const parsed = sendOtpSchema.safeParse(req.body);
  if (!parsed.success) {
    return next(parsed.error);
  }

  const { phone } = parsed.data;
  const otp = generateOTP();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // Expires in 5 minutes

  // Upsert the LoginOtp record (using phone as unique identifier)
  await prisma.loginOtp.upsert({
    where: { phone },
    update: {
      otp,
      expiresAt,
      attempts: 0,
      verified: false,
    },
    create: {
      phone,
      otp,
      expiresAt,
      attempts: 0,
      verified: false,
    },
  });

  // Log OTP in console for development/testing
  console.log(`[OTP Sent] Phone: ${phone} | OTP: ${otp}`);

  return SuccessResponse(
    res,
    "OTP sent successfully",
    { phone, otp: env.server.nodeEnv === "development" ? otp : undefined },
    statusCode.OK
  );
});

/**
 * @desc    Verify OTP and log in / return verification state
 * @route   POST /api/v1/auth/verify-otp
 * @access  Public
 */
export const verifyOtp = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const parsed = verifyOtpSchema.safeParse(req.body);
  if (!parsed.success) {
    return next(parsed.error);
  }

  const { phone, otp } = parsed.data;

  // Retrieve OTP record
  const loginOtp = await prisma.loginOtp.findUnique({
    where: { phone },
  });

  if (!loginOtp) {
    return next(new ErrorResponse("OTP record not found", statusCode.Not_Found));
  }

  // Check if expired
  if (new Date() > new Date(loginOtp.expiresAt)) {
    return next(new ErrorResponse("OTP has expired", statusCode.Bad_Request));
  }

  // Check maximum attempts limit (e.g., 5 attempts)
  if (loginOtp.attempts >= 5) {
    return next(new ErrorResponse("Too many incorrect attempts. Please request a new OTP.", statusCode.Too_Many_Requests));
  }

  // Check if OTP matches
  if (loginOtp.otp !== otp) {
    await prisma.loginOtp.update({
      where: { phone },
      data: { attempts: { increment: 1 } },
    });
    return next(new ErrorResponse("Invalid OTP code", statusCode.Bad_Request));
  }

  // Mark OTP as verified and reset attempts
  await prisma.loginOtp.update({
    where: { phone },
    data: {
      verified: true,
      attempts: 0,
    },
  });

  // Check if user exists with this phone number
  let user = await prisma.user.findUnique({
    where: { phone },
    include: { 
      role: {
        include: {
          permissions: true
        }
      } 
    },
  });

  let isNewUser = false;
  if (!user) {
    // First time login - auto-create user record (no role assignment — role comes from membership)
    user = await prisma.user.create({
      data: {
        phone,
        name: "", // Default empty name
        email: null as any,
      },
      include: { 
        role: {
          include: {
            permissions: true
          }
        } 
      },
    });
    isNewUser = true;
  }

  // Check if user belongs to an onboarded organization in the database
  const membership = await getActiveMembership(user.id);

  if (!membership || !membership.organizations) {
    return next(
      new ErrorResponse(
        "Organization does not exist in the database. Please onboard your organization first.",
        statusCode.Forbidden
      )
    );
  }

  const organizationId = membership.organizationId;
  // Use org-scoped role from membership
  const orgRole = membership.role || user.role;

  // Link or create the employee record for this user
  const employee = await linkOrCreateEmployeeForUser(user, organizationId);

  // Sign JWT and login — include organizationId in payload
  const jwtSecret = env.jwt.secret || "123456";
  const token = signToken(
    { id: user.id, phoneNumber: user.phone, email: user.email, organizationId },
    jwtSecret
  );

  setAuthCookie(res, token);

  return SuccessResponse(
    res,
    isNewUser ? "First-time login successful" : "Login successful",
    {
      user: {
        id: user.id,
        employeeId: employee?.id || null,
        name: employee?.name || user.name,
        email: employee?.email || user.email,
        phone: user.phone,
        avatar: employee?.avatar || null,
        role: orgRole?.name || "EMPLOYEE",
        permissions: orgRole?.permissions?.map((p: any) => p.name) || [],
        organizationId,
      },
      token,
      isRegistered: true,
    },
    statusCode.OK
  );
});

/**
 * @desc    Register a new user (via email/phone/password)
 * @route   POST /api/v1/auth/register
 * @access  Public
 */
export const register = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return next(parsed.error);
  }

  const { name, email, phone, password } = parsed.data;

  // Check if user already exists
  const existingUser = await prisma.user.findFirst({
    where: {
      OR: [{ email }, { phone }],
    },
  });

  if (existingUser) {
    const field = existingUser.email === email ? "Email" : "Phone number";
    return next(new ErrorResponse(`${field} is already registered`, statusCode.Conflict));
  }

  // Create new user with hashed password (roles/permissions are assigned through organization membership)
  const newUser = await prisma.user.create({
    data: {
      name,
      email,
      phone,
      password: hashPassword(password),
    },
    include: { 
      role: {
        include: {
          permissions: true
        }
      } 
    },
  });

  // Check membership for org-scoped role
  const membership = await getActiveMembership(newUser.id);
  const organizationId = membership?.organizationId;
  const orgRole = membership?.role || newUser.role;

  // Link or create the employee record for this user
  const employee = await linkOrCreateEmployeeForUser(newUser, organizationId);

  // Sign JWT token — include organizationId
  const jwtSecret = env.jwt.secret || "123456";
  const token = signToken(
    { id: newUser.id, phoneNumber: newUser.phone, email: newUser.email, organizationId },
    jwtSecret
  );

  setAuthCookie(res, token);

  return SuccessResponse(
    res,
    "User registered successfully",
    {
      user: {
        id: newUser.id,
        employeeId: employee?.id || null,
        name: employee?.name || newUser.name,
        email: employee?.email || newUser.email,
        phone: newUser.phone,
        role: orgRole?.name || "EMPLOYEE",
        permissions: orgRole?.permissions?.map((p: any) => p.name) || [],
        organizationId,
      },
      token,
    },
    statusCode.Created
  );
});

/**
 * @desc    Log in with email or phone and password
 * @route   POST /api/v1/auth/login
 * @access  Public
 */
export const login = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return next(parsed.error);
  }

  const { email, phone, password } = parsed.data;

  // 1. Search User table by email or phone (case-insensitive for email)
  const userConditions: any[] = [];
  if (email) userConditions.push({ email: { equals: email.trim(), mode: "insensitive" } });
  if (phone) userConditions.push({ phone: phone.trim() });

  let user = userConditions.length > 0
    ? await prisma.user.findFirst({
        where: { OR: userConditions },
        include: { 
          role: {
            include: {
              permissions: true
            }
          } 
        },
      })
    : null;

  let passwordMatches = false;
  const singleHash = hashPassword(password);
  const doubleHash = hashPassword(singleHash);

  if (user && user.password) {
    if (user.password === singleHash || user.password === doubleHash || user.password === password) {
      passwordMatches = true;
      // If legacy doubleHash or plaintext matched, automatically update User password to singleHash
      if (user.password !== singleHash) {
        prisma.user.update({
          where: { id: user.id },
          data: { password: singleHash }
        }).catch(err => console.warn("[Auth] Failed to update user password hash:", err));
      }
    }
  }

  // 2. If user missing or password mismatch on User table, fallback to Employee table
  if (!user || !passwordMatches) {
    const empConditions: any[] = [];
    if (email) empConditions.push({ email: { equals: email.trim(), mode: "insensitive" } });
    if (phone) empConditions.push({ phone: phone.trim() });

    const employee = empConditions.length > 0
      ? await prisma.employee.findFirst({
          where: { OR: empConditions },
        })
      : null;

    if (employee && employee.password) {
      const isEmpPassMatch = 
        employee.password === singleHash || 
        employee.password === doubleHash || 
        employee.password === password;

      if (isEmpPassMatch) {
        // Link or create user account matching this employee record
        if (!user && employee.userId) {
          user = await prisma.user.findUnique({
            where: { id: employee.userId },
            include: { 
              role: {
                include: {
                  permissions: true
                }
              } 
            },
          });
        }

        if (!user) {
          user = await prisma.user.findFirst({
            where: {
              OR: [
                employee.email ? { email: { equals: employee.email, mode: "insensitive" } } : null,
                employee.phone ? { phone: employee.phone } : null,
              ].filter(Boolean) as any[],
            },
            include: { 
              role: {
                include: {
                  permissions: true
                }
              } 
            },
          });
        }

        if (!user) {
          user = await prisma.user.create({
            data: {
              name: employee.name,
              email: employee.email,
              phone: employee.phone,
              password: singleHash,
            },
            include: { 
              role: {
                include: {
                  permissions: true
                }
              } 
            },
          });
        } else {
          user = await prisma.user.update({
            where: { id: user.id },
            data: { password: singleHash },
            include: { 
              role: {
                include: {
                  permissions: true
                }
              } 
            },
          });
        }

        if (!employee.userId) {
          await prisma.employee.update({
            where: { id: employee.id },
            data: { userId: user.id },
          });
        }

        passwordMatches = true;
      }
    }
  }

  if (!user || !passwordMatches) {
    return next(new ErrorResponse("Invalid credentials", statusCode.Unauthorized));
  }

  // Check if user belongs to an onboarded organization in the database
  let membership = await getActiveMembership(user.id);

  if (!membership || !membership.organizations) {
    // Attempt auto-repair membership if user has a linked employee or an organization exists in DB
    const linkedEmp = await prisma.employee.findFirst({
      where: {
        OR: [
          { userId: user.id },
          ...(user.email ? [{ email: { equals: user.email, mode: "insensitive" as const } }] : []),
          ...(user.phone ? [{ phone: user.phone }] : [])
        ]
      }
    });

    const targetOrgId = linkedEmp?.organizationId || (await prisma.organization.findFirst())?.id;
    if (targetOrgId) {
      const empRole = await prisma.role.findFirst({ where: { name: "EMPLOYEE" } });
      await prisma.membership.upsert({
        where: {
          userId_organizationId: {
            userId: user.id,
            organizationId: targetOrgId
          }
        },
        update: { status: "ACTIVE" },
        create: {
          userId: user.id,
          organizationId: targetOrgId,
          status: "ACTIVE",
          roleId: empRole?.id || null
        }
      }).catch(err => console.warn("[Auth] Failed to auto-create membership during login:", err.message));

      membership = await getActiveMembership(user.id);
    }
  }

  if (!membership || !membership.organizations) {
    return next(
      new ErrorResponse(
        "Organization does not exist in the database. Please onboard your organization first.",
        statusCode.Forbidden
      )
    );
  }

  const organizationId = membership.organizationId;
  // Use org-scoped role from membership
  const orgRole = membership.role || user.role;

  // Link or create the employee record for this user
  const employee = await linkOrCreateEmployeeForUser(user, organizationId);

  // Sign JWT token — include organizationId
  const jwtSecret = env.jwt.secret || "123456";
  const token = signToken(
    { id: user.id, phoneNumber: user.phone, email: user.email, organizationId },
    jwtSecret
  );

  setAuthCookie(res, token);

  return SuccessResponse(
    res,
    "Login successful",
    {
      user: {
        id: user.id,
        employeeId: employee?.id || null,
        name: employee?.name || user.name,
        email: employee?.email || user.email,
        phone: user.phone,
        avatar: employee?.avatar || null,
        role: orgRole?.name || "EMPLOYEE",
        permissions: orgRole?.permissions?.map((p: any) => p.name) || [],
        organizationId,
      },
      token,
    },
    statusCode.OK
  );
});

/**
 * @desc    Get currently logged in user profile
 * @route   GET /api/v1/auth/profile
 * @access  Private (Requires authentication middleware)
 */
export interface AuthenticatedRequest extends Request {
  user?: any;
}

export const getProfile = asyncHandler(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    return next(new ErrorResponse("Not authorized to access this route", statusCode.Unauthorized));
  }

  // 1. Try finding linked employee by userId
  let employee = await prisma.employee.findUnique({
    where: { userId: req.user.id }
  });

  // 2. Fallback: match by email or phone if not linked by userId
  if (!employee && (req.user.email || req.user.phone)) {
    const conditions: any[] = [];
    if (req.user.email) conditions.push({ email: req.user.email });
    if (req.user.phone) conditions.push({ phone: req.user.phone });
    
    employee = await prisma.employee.findFirst({
      where: { OR: conditions }
    });
  }

  const avatarUrl = employee?.avatar || null;

  // Get org-scoped role (already resolved in middleware)
  const orgRole = req.user.role;

  return SuccessResponse(
    res,
    "Profile retrieved successfully",
    {
      user: {
        id: req.user.id,
        employeeId: employee?.id || null,
        name: employee?.name || req.user.name,
        email: employee?.email || req.user.email,
        phone: req.user.phone,
        avatar: avatarUrl,
        image: avatarUrl,
        role: orgRole?.name || "EMPLOYEE",
        permissions: orgRole?.permissions?.map((p: any) => p.name) || [],
        organizationId: req.user.organizationId,
      }
    },
    statusCode.OK
  );
});
