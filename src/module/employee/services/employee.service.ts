import crypto from "crypto";
import { prisma } from "../../../db/prisma.ts";
import { statusCode } from "../../../types/types.ts";
import { ErrorResponse } from "../../../utils/response.util.ts";
import { EmployeeRepository } from "../repo/employee.repo.ts";

function generateEmployeeId() {
  return `EMP-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

export class EmployeeService {
  static async createEmployee(data: any, organizationId?: string) {
    // 1. Resolve ID (ensure unique)
    let employeeId = data.id || data.employeeId;
    if (employeeId) {
      const existingId = await EmployeeRepository.findById(employeeId);
      if (existingId) {
        let uniqueId = generateEmployeeId();
        let attempts = 0;
        while (attempts < 5) {
          const existing = await EmployeeRepository.findById(uniqueId);
          if (!existing) {
            employeeId = uniqueId;
            break;
          }
          uniqueId = generateEmployeeId();
          attempts++;
        }
        if (!employeeId || (await EmployeeRepository.findById(employeeId))) {
          employeeId = `EMP-${Date.now().toString().slice(-6)}`;
        }
      }
    } else {
      let uniqueId = generateEmployeeId();
      let attempts = 0;
      while (attempts < 5) {
        const existing = await EmployeeRepository.findById(uniqueId);
        if (!existing) {
          employeeId = uniqueId;
          break;
        }
        uniqueId = generateEmployeeId();
        attempts++;
      }
      if (!employeeId) {
        employeeId = `EMP-${Date.now().toString().slice(-6)}`;
      }
    }
    data.id = employeeId;

    // 2. Normalize and validate email
    if (data.email) {
      data.email = data.email.toLowerCase().trim();
    }

    // 3. Validate user account binding
    if (data.userId) {
      const user = await EmployeeRepository.findUserById(data.userId);
      if (!user) {
        throw new ErrorResponse("Associated User account not found", statusCode.Not_Found);
      }

      const existingUserBinding = await EmployeeRepository.findByUserId(data.userId);
      if (existingUserBinding) {
        throw new ErrorResponse("This User account is already linked to another employee", statusCode.Conflict);
      }
    }

    // 4. Validate department existence
    if (data.departmentId) {
      const dept = await EmployeeRepository.findDepartmentById(data.departmentId);
      if (!dept) {
        console.warn(`[Employee Service] Department with ID ${data.departmentId} not found. Setting departmentId to null.`);
        data.departmentId = null;
      }
    }

    // 5. Validate manager existence
    if (data.managerId) {
      if (data.managerId === employeeId) {
        throw new ErrorResponse("An employee cannot be their own manager", statusCode.Bad_Request);
      }
      
      let managerIdInDb: string | null = null;
      const managerById = await EmployeeRepository.findById(data.managerId);
      if (managerById) {
        managerIdInDb = managerById.id;
      } else {
        const managerByUserId = await EmployeeRepository.findByUserId(data.managerId);
        if (managerByUserId) {
          managerIdInDb = managerByUserId.id;
        }
      }

      if (!managerIdInDb) {
        console.warn(`[Employee Service] Manager with ID ${data.managerId} not found. Setting managerId to null.`);
        data.managerId = null;
      } else {
        data.managerId = managerIdInDb;
      }

      if (data.managerId === employeeId) {
        throw new ErrorResponse("An employee cannot be their own manager", statusCode.Bad_Request);
      }
    }

    // Resolve final organizationId
    const effectiveOrgId = organizationId || (await prisma.organization.findFirst())?.id || null;
    const { roleId: requestedRoleId, ...employeeFields } = data;

    // Handle password hashing consistently (once)
    const rawPassword = data.password || "Password@123";
    const hashedPassword = crypto.createHash("sha256").update(rawPassword).digest("hex");
    employeeFields.password = hashedPassword;

    // Sync or create associated User account for login authentication & organization binding
    if (data.email) {
      try {
        // Resolve role: Use requested roleId (created by organization), or fallback to organization's EMPLOYEE role
        let assignedRoleId: string | null = null;
        if (requestedRoleId) {
          const matchedRole = await prisma.role.findUnique({
            where: { id: requestedRoleId },
          });
          if (matchedRole && (!matchedRole.organizationId || matchedRole.organizationId === effectiveOrgId)) {
            assignedRoleId = matchedRole.id;
          }
        }

        if (!assignedRoleId) {
          let empRole = await prisma.role.findFirst({
            where: {
              name: "EMPLOYEE",
              ...(effectiveOrgId ? { OR: [{ organizationId: effectiveOrgId }, { organizationId: null }] } : {}),
            },
            orderBy: { organizationId: "desc" },
          });

          if (!empRole) {
            empRole = await prisma.role.create({
              data: {
                name: "EMPLOYEE",
                description: "Standard employee role",
                isSystem: true,
                organizationId: effectiveOrgId || null,
              },
            });
          }
          assignedRoleId = empRole.id;
        }

        let targetUser = null;

        // If data.userId was explicitly specified in request, check if it's available
        if (data.userId) {
          const userObj = await prisma.user.findUnique({ where: { id: data.userId } });
          if (userObj) {
            targetUser = userObj;
          }
        }

        // If no targetUser resolved yet, search by email (case-insensitive) or phone
        if (!targetUser) {
          const searchEmail = data.email.toLowerCase().trim();
          const candidateUsers = await prisma.user.findMany({
            where: {
              OR: [
                { email: { equals: searchEmail, mode: "insensitive" } },
                ...(data.phone ? [{ phone: data.phone }] : [])
              ]
            }
          });

          if (candidateUsers.length > 0) {
            targetUser = candidateUsers[0];
          }
        }

        if (!targetUser) {
          let userPhone = data.phone || null;
          if (userPhone) {
            const existingPhoneUser = await prisma.user.findUnique({ where: { phone: userPhone } });
            if (existingPhoneUser) {
              userPhone = null; // Drop phone on User account if already taken by another user
            }
          }

          targetUser = await prisma.user.create({
            data: {
              name: data.name,
              email: data.email,
              phone: userPhone,
              password: hashedPassword,
              roleId: assignedRoleId,
            }
          });
        } else {
          targetUser = await prisma.user.update({
            where: { id: targetUser.id },
            data: {
              password: hashedPassword,
              name: targetUser.name || data.name,
              roleId: requestedRoleId ? assignedRoleId : (targetUser.roleId || assignedRoleId),
            }
          });
        }

        data.userId = targetUser.id;
        employeeFields.userId = targetUser.id;

        // Ensure user has active membership in the target organization or default organization
        if (effectiveOrgId) {
          await prisma.membership.upsert({
            where: {
              userId_organizationId: {
                userId: targetUser.id,
                organizationId: effectiveOrgId,
              },
            },
            update: {
              status: "ACTIVE",
              ...(assignedRoleId ? { roleId: assignedRoleId } : {}),
            },
            create: {
              userId: targetUser.id,
              organizationId: effectiveOrgId,
              status: "ACTIVE",
              roleId: assignedRoleId,
            },
          });
        }
      } catch (userErr: any) {
        console.warn("[Employee Service] Could not sync User table/membership during employee creation:", userErr.message);
      }
    }

    // Create final employee data
    const createData = {
      ...employeeFields,
      id: employeeId,
      organizationId: effectiveOrgId,
    };

    return EmployeeRepository.create(createData);
  }

  static async getEmployees(filters: {
    organizationId?: string;
    departmentId?: string;
    managerId?: string;
    status?: any;
    search?: string;
    userId?: string;
  }) {
    return EmployeeRepository.findAll(filters);
  }

  static async getEmployeeById(id: string) {
    const employee = await EmployeeRepository.findById(id);
    if (!employee) {
      return null;
    }
    return employee;
  }

  static async updateEmployee(id: string, data: any) {
    const employee = await EmployeeRepository.findById(id);
    if (!employee) {
      throw new ErrorResponse("Employee not found", statusCode.Not_Found);
    }

    // 1. If email changes, validate uniqueness
    if (data.email && data.email !== employee.email) {
      const existingEmail = await EmployeeRepository.findByEmail(data.email);
      if (existingEmail) {
        throw new ErrorResponse("Email is already in use by another employee", statusCode.Conflict);
      }
    }

    // 2. If userId changes, validate existence and uniqueness
    if (data.userId && data.userId !== employee.userId) {
      const user = await EmployeeRepository.findUserById(data.userId);
      if (!user) {
        throw new ErrorResponse("Associated User account not found", statusCode.Not_Found);
      }

      const existingUserBinding = await EmployeeRepository.findByUserId(data.userId);
      if (existingUserBinding) {
        throw new ErrorResponse("This User account is already linked to another employee", statusCode.Conflict);
      }
    }

    // 3. If departmentId changes, validate existence
    if (data.departmentId && data.departmentId !== employee.departmentId) {
      const dept = await EmployeeRepository.findDepartmentById(data.departmentId);
      if (!dept) {
        console.warn(`[Employee Service] Department with ID ${data.departmentId} not found. Setting departmentId to null.`);
        data.departmentId = null;
      }
    }

    // 4. If managerId changes, validate existence and self-loop
    if (data.managerId && data.managerId !== employee.managerId) {
      if (data.managerId === id) {
        throw new ErrorResponse("An employee cannot be their own manager", statusCode.Bad_Request);
      }
      
      let managerIdInDb: string | null = null;
      const managerById = await EmployeeRepository.findById(data.managerId);
      if (managerById) {
        managerIdInDb = managerById.id;
      } else {
        const managerByUserId = await EmployeeRepository.findByUserId(data.managerId);
        if (managerByUserId) {
          managerIdInDb = managerByUserId.id;
        }
      }

      if (!managerIdInDb) {
        console.warn(`[Employee Service] Manager with ID ${data.managerId} not found. Setting managerId to null.`);
        data.managerId = null;
      } else {
        data.managerId = managerIdInDb;
      }

      if (data.managerId === id) {
        throw new ErrorResponse("An employee cannot be their own manager", statusCode.Bad_Request);
      }
    }

    if (data.password) {
      const hashedPassword = crypto.createHash("sha256").update(data.password).digest("hex");
      data.password = hashedPassword;

      // Sync password to associated User account so login succeeds
      const targetUserId = data.userId || employee.userId;
      if (targetUserId) {
        await prisma.user.update({
          where: { id: targetUserId },
          data: { password: hashedPassword }
        }).catch(err => console.warn("[Employee Service] Failed to sync user password on update:", err.message));
      } else if (employee.email || data.email) {
        const targetEmail = data.email || employee.email;
        const userByEmail = await prisma.user.findFirst({ where: { email: targetEmail } });
        if (userByEmail) {
          await prisma.user.update({
            where: { id: userByEmail.id },
            data: { password: hashedPassword }
          }).catch(err => console.warn("[Employee Service] Failed to sync user password on update:", err.message));
        }
      }
    }

    return EmployeeRepository.update(id, data);
  }

  static async deleteEmployee(id: string) {
    const employee = await EmployeeRepository.findById(id);
    if (!employee) {
      throw new ErrorResponse("Employee not found", statusCode.Not_Found);
    }

    return EmployeeRepository.delete(id);
  }

  static async getEmployeeSalary(id: string) {
    const employee = await EmployeeRepository.findById(id);
    if (!employee) {
      return null;
    }
    return {
      basic: employee.basic,
      hra: employee.hra,
      allowance: employee.allowance,
      deductions: employee.deductions,
      netSalary: employee.netSalary,
      bankName: employee.bankName,
      bankAccount: employee.bankAccount,
      ifsc: employee.ifsc,
      pan: employee.pan,
      aadhaar: employee.aadhaar,
      uan: employee.uan,
      pfNumber: employee.pfNumber,
    };
  }

  static async updateEmployeeSalary(id: string, data: any) {
    const employee = await EmployeeRepository.findById(id);
    if (!employee) {
      throw new ErrorResponse("Employee not found", statusCode.Not_Found);
    }
    return EmployeeRepository.update(id, data);
  }

  static async getEmployeePersonal(id: string) {
    const employee = await EmployeeRepository.findById(id);
    if (!employee) {
      return null;
    }
    return {
      gender: employee.gender,
      dob: employee.dob,
      bloodGroup: employee.bloodGroup,
      maritalStatus: employee.maritalStatus,
      qualification: employee.qualification,
      university: employee.university,
      passingYear: employee.passingYear,
      fatherName: employee.fatherName,
      permanentAddress: employee.permanentAddress,
      languagesSpoken: employee.languagesSpoken,
    };
  }

  static async updateEmployeePersonal(id: string, data: any) {
    const employee = await EmployeeRepository.findById(id);
    if (!employee) {
      throw new ErrorResponse("Employee not found", statusCode.Not_Found);
    }
    return EmployeeRepository.update(id, data);
  }

  // Family Members & Dependents
  static async getEmployeeFamily(employeeId: string) {
    const employee = await EmployeeRepository.findById(employeeId);
    if (!employee) {
      return [];
    }
    return EmployeeRepository.findFamilyMembers(employeeId);
  }

  static async addEmployeeFamilyMember(employeeId: string, data: any) {
    const employee = await EmployeeRepository.findById(employeeId);
    if (!employee) {
      throw new ErrorResponse("Employee not found", statusCode.Not_Found);
    }
    return EmployeeRepository.createFamilyMember(employeeId, data);
  }

  static async removeEmployeeFamilyMember(familyId: string) {
    return EmployeeRepository.deleteFamilyMember(familyId);
  }

  // Employee Exit & Clearance Service Methods
  static async getEmployeeExit(employeeId: string) {
    const employee = await EmployeeRepository.findById(employeeId);
    if (!employee) {
      throw new ErrorResponse("Employee not found", statusCode.Not_Found);
    }
    return EmployeeRepository.findExitByEmployeeId(employeeId);
  }

  static async upsertEmployeeExit(employeeId: string, data: any) {
    const employee = await EmployeeRepository.findById(employeeId);
    if (!employee) {
      throw new ErrorResponse("Employee not found", statusCode.Not_Found);
    }
    const exitRecord = await EmployeeRepository.upsertExit(employeeId, data);
    
    // Sync employee status and exit date
    const isApproved = data.status === "CLEARANCE_APPROVED" || data.status === "SETTLED" || (data.itClearance && data.financeClearance && data.adminClearance && data.hrClearance);
    await EmployeeRepository.update(employeeId, {
      exitDate: data.lastWorkingDay,
      clearanceStatus: isApproved ? "Approved" : "Pending",
      status: isApproved ? "RESIGNED" : employee.status,
    });

    return exitRecord;
  }

  // Credentials Management for Organization Admin / HR
  static async resetEmployeeCredentials(
    employeeId: string,
    data: { newEmail?: string | null; newPassword?: string | null; email?: string | null; password?: string | null },
    requestingUser?: any
  ) {
    const employee = await EmployeeRepository.findById(employeeId);
    if (!employee) {
      throw new ErrorResponse("Employee not found", statusCode.Not_Found);
    }

    // Multi-tenancy check: requesting user must belong to same organization (unless platform admin)
    if (
      requestingUser &&
      !requestingUser.isPlatformAdmin &&
      requestingUser.role?.name !== "PLATFORM_ADMIN" &&
      employee.organizationId &&
      requestingUser.organizationId &&
      employee.organizationId !== requestingUser.organizationId
    ) {
      throw new ErrorResponse("You do not have permission to manage credentials for this employee", statusCode.Forbidden);
    }

    const emailToSet = (data.newEmail || data.email)?.trim().toLowerCase();
    let plainPassword = (data.newPassword || data.password)?.trim();

    if (!plainPassword) {
      // Auto-generate strong secure password
      plainPassword = `Emp@${crypto.randomBytes(3).toString("hex").toUpperCase()}!`;
    }

    const hashedPassword = crypto.createHash("sha256").update(plainPassword).digest("hex");

    // If email is changing, check for uniqueness across employees and users
    if (emailToSet && emailToSet !== employee.email?.toLowerCase()) {
      const existingEmployeeWithEmail = await prisma.employee.findFirst({
        where: {
          email: { equals: emailToSet, mode: "insensitive" },
          NOT: { id: employeeId },
        },
      });
      if (existingEmployeeWithEmail) {
        throw new ErrorResponse(`Email '${emailToSet}' is already assigned to another employee`, statusCode.Conflict);
      }

      const existingUserWithEmail = await prisma.user.findFirst({
        where: {
          email: { equals: emailToSet, mode: "insensitive" },
          ...(employee.userId ? { NOT: { id: employee.userId } } : {}),
        },
      });
      if (existingUserWithEmail) {
        throw new ErrorResponse(`Email '${emailToSet}' is already linked to another user account`, statusCode.Conflict);
      }
    }

    const finalEmail = emailToSet || employee.email;

    // 1. Update Employee table
    const updatedEmployee = await prisma.employee.update({
      where: { id: employeeId },
      data: {
        ...(emailToSet ? { email: finalEmail } : {}),
        password: hashedPassword,
      },
      include: {
        department: true,
        user: { include: { role: true } },
      },
    });

    // 2. Synchronize User table (and organization membership)
    let userAccount: any = null;
    if (employee.userId) {
      userAccount = await prisma.user.update({
        where: { id: employee.userId },
        data: {
          ...(emailToSet ? { email: finalEmail } : {}),
          password: hashedPassword,
        },
      }).catch((err: any) => {
        console.warn("[Employee Reset] Could not update linked user:", err.message);
        return null;
      });
    } else {
      // Search user by email or phone
      const existingUser = await prisma.user.findFirst({
        where: {
          OR: [
            finalEmail ? { email: { equals: finalEmail, mode: "insensitive" } } : null,
            employee.phone ? { phone: employee.phone } : null,
          ].filter(Boolean) as any[],
        },
      });

      if (existingUser) {
        userAccount = await prisma.user.update({
          where: { id: existingUser.id },
          data: {
            password: hashedPassword,
            ...(emailToSet ? { email: finalEmail } : {}),
          },
        });
        await prisma.employee.update({
          where: { id: employeeId },
          data: { userId: existingUser.id },
        });
      } else {
        const defaultRole = await prisma.role.findFirst({
          where: { name: "EMPLOYEE" },
        });

        userAccount = await prisma.user.create({
          data: {
            name: employee.name,
            email: finalEmail,
            phone: employee.phone || null,
            password: hashedPassword,
            roleId: defaultRole?.id || null,
          },
        }).catch((err: any) => {
          console.warn("[Employee Reset] Could not auto-create user for employee:", err.message);
          return null;
        });

        if (userAccount) {
          await prisma.employee.update({
            where: { id: employeeId },
            data: { userId: userAccount.id },
          });

          if (employee.organizationId) {
            await prisma.membership.upsert({
              where: {
                userId_organizationId: {
                  userId: userAccount.id,
                  organizationId: employee.organizationId,
                },
              },
              update: {
                status: "ACTIVE",
                ...(defaultRole?.id ? { roleId: defaultRole.id } : {}),
              },
              create: {
                userId: userAccount.id,
                organizationId: employee.organizationId,
                roleId: defaultRole?.id || null,
                status: "ACTIVE",
              },
            }).catch((err: any) => console.warn("[Employee Reset] Membership sync error:", err.message));
          }
        }
      }
    }

    return {
      employeeId: updatedEmployee.id,
      employeeName: updatedEmployee.name,
      email: finalEmail,
      temporaryPassword: plainPassword,
      updatedAt: new Date().toISOString(),
    };
  }

  static async getEmployeeCredentials(employeeId: string, requestingUser?: any) {
    const employee = await EmployeeRepository.findById(employeeId);
    if (!employee) {
      throw new ErrorResponse("Employee not found", statusCode.Not_Found);
    }

    if (
      requestingUser &&
      !requestingUser.isPlatformAdmin &&
      requestingUser.role?.name !== "PLATFORM_ADMIN" &&
      employee.organizationId &&
      requestingUser.organizationId &&
      employee.organizationId !== requestingUser.organizationId
    ) {
      throw new ErrorResponse("You do not have permission to view credentials for this employee", statusCode.Forbidden);
    }

    return {
      employeeId: employee.id,
      employeeName: employee.name,
      email: employee.email,
      hasPasswordSet: !!employee.password,
      organizationId: employee.organizationId,
      userId: employee.userId,
      status: employee.status,
    };
  }
}
