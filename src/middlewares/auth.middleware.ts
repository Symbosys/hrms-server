import type { NextFunction, Request, Response } from "express";
import env from "../config/env.config";
import { prisma } from "../db/prisma.ts";
import { PlatformRepository } from "../module/platform/repo/platform.repo.ts";
import { AdminUserRepository } from "../module/admin/repo/admin.repo.ts";
import type { PermissionName } from "../types/permission.ts";
import { verifyToken } from "../utils/jwt.util";
import { ErrorResponse } from "../utils/response.util";
import { asyncHandler } from "./error.middleware";

export interface AuthenticatedRequest extends Request {
  user?: any;
}

export const protect = asyncHandler(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  let token: string | undefined;

  // Log request info for tracing
  console.log(`[Auth Middleware] Incoming Request: ${req.method} ${req.originalUrl}`);

  // 1. Extract token from cookies (either pre-parsed by cookie-parser or parsed manually)
  if (req.cookies && typeof req.cookies.token === "string") {
    token = req.cookies.token;
    console.log("[Auth Middleware] Extracted token from parsed req.cookies.");
  } else if (req.headers.cookie) {
    const rawCookies = req.headers.cookie.split(";");
    for (const rawCookie of rawCookies) {
      const parts = rawCookie.split("=");
      const key = parts[0];
      const val = parts[1];
      if (key && val && key.trim() === "token") {
        token = val.trim();
        console.log("[Auth Middleware] Extracted token manually from req.headers.cookie.");
        break;
      }
    }
  }

  // 2. Fallback to Bearer Authorization header if cookie is missing
  if (!token && req.headers.authorization) {
    const parts = req.headers.authorization.split(" ");
    const firstPart = parts[0];
    const secondPart = parts[1];
    if (parts.length === 2 && firstPart && secondPart && firstPart.toLowerCase() === "bearer") {
      token = secondPart;
      console.log("[Auth Middleware] Extracted token from Authorization header fallback.");
    }
  }

  if (!token) {
    console.warn("[Auth Middleware] No token found in cookies or authorization headers.");
    return next(new ErrorResponse("Not authorized to access this route", 401));
  }

  try {
    const jwtSecret = env.jwt.secret || "123456";
    
    // Verify the JWT token signature and expiration
    const decoded = verifyToken(token, jwtSecret);
    console.log("[Auth Middleware] Token verified successfully. Decoded payload:", decoded);

    // Check if explicit platform admin token (contains role PLATFORM_ADMIN, isPlatformAdmin flag, or admin type)
    if (decoded.isPlatformAdmin || decoded.role === "PLATFORM_ADMIN" || decoded.type === "admin") {
      req.user = {
        id: decoded.id,
        email: decoded.email,
        role: { name: decoded.role || "PLATFORM_ADMIN" },
        isPlatformAdmin: true,
      };
      return next();
    }

    if (!decoded.phoneNumber && !decoded.id) {
      console.warn("[Auth Middleware] Token does not contain an id or phone number.");
      return next(new ErrorResponse("Not authorized to access this route", 401));
    }

    // Retrieve user directly from the database using prisma
    let user = null;
    if (decoded.id) {
      user = await prisma.user.findUnique({
        where: { id: decoded.id },
        include: { 
          memberships: {
            include: { 
              organizations: true,
              role: {
                include: {
                  permissions: true,
                }
              }
            }
          },
          role: {
            include: {
              permissions: true
            }
          } 
        },
      });
    }

    if (!user && decoded.phoneNumber) {
      user = await prisma.user.findFirst({
        where: { phone: decoded.phoneNumber },
        include: { 
          memberships: {
            include: { 
              organizations: true,
              role: {
                include: {
                  permissions: true,
                }
              }
            }
          },
          role: {
            include: {
              permissions: true
            }
          } 
        },
      });
    }

    if (!user) {
      // Fallback check: verify if the token's decoded.id corresponds to a Platform Admin in platform_admins or admin_users table
      if (decoded.id) {
        const platformAdmin = await PlatformRepository.findById(decoded.id);
        if (platformAdmin) {
          req.user = {
            id: platformAdmin.id,
            email: platformAdmin.email,
            role: { name: platformAdmin.role || "PLATFORM_ADMIN" },
            isPlatformAdmin: true,
          };
          return next();
        }

        const adminUser = await AdminUserRepository.findById(decoded.id);
        if (adminUser) {
          req.user = {
            id: adminUser.id,
            email: adminUser.email,
            role: { name: adminUser.role || "PLATFORM_ADMIN" },
            isPlatformAdmin: true,
          };
          return next();
        }
      }

      console.warn(`[Auth Middleware] User with ID ${decoded.id || 'N/A'} or phone ${decoded.phoneNumber || 'N/A'} not found in database.`);
      return next(new ErrorResponse("User not found", 404));
    }

    // Determine the primary organization and org-scoped role from membership
    const activeMembership = user.memberships?.find((m: any) => m.status === "ACTIVE") || user.memberships?.[0];
    const primaryOrganizationId = activeMembership?.organizationId;

    // Use the org-scoped role from membership if available, otherwise fall back to user's direct role
    const orgRole = activeMembership?.role || user.role;

    req.user = {
      ...user,
      organizationId: primaryOrganizationId,
      // Override role with the org-scoped role from membership
      role: orgRole,
    };
    next();
  } catch (error: any) {
    console.error("JWT Verification failed:", error.message || error);
    return next(new ErrorResponse("Not authorized to access this route", 401));
  }
});

/**
 * Route authorization restriction middleware based on role list.
 * Checks the user's org-scoped role name.
 */
export const restrictTo = (...roles: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new ErrorResponse("Not authorized to access this route", 401));
    }

    // Platform admins always have full access
    if (req.user.isPlatformAdmin) {
      return next();
    }

    // Check if the user's org-scoped role name matches any of the allowed roles
    const userRoleName = req.user.role?.name;

    // Org SUPER_ADMIN has full access within their org
    if (userRoleName === "SUPER_ADMIN") {
      return next();
    }

    if (!userRoleName || !roles.includes(userRoleName)) {
      return next(new ErrorResponse("You do not have permission to perform this action", 403));
    }

    next();
  };
};

/**
 * Route authorization middleware based on permissions.
 * Checks if the user's role possesses AT LEAST ONE of the required permissions.
 * Platform Admins and Org SUPER_ADMIN bypass permission checks.
 */
export const hasPermission = (...requiredPermissions: PermissionName[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new ErrorResponse("Not authorized to access this route", 401));
    }

    // Platform admins or org SUPER_ADMIN have full access
    if (req.user.isPlatformAdmin || req.user.role?.name === "SUPER_ADMIN") {
      return next();
    }

    const userPermissions: string[] =
      req.user.role?.permissions?.map((p: any) => (typeof p === "string" ? p : p.name)) || [];

    const hasAnyPermission = requiredPermissions.some((perm) => userPermissions.includes(perm));

    if (!hasAnyPermission) {
      return next(new ErrorResponse("You do not have permission to perform this action", 403));
    }

    next();
  };
};
