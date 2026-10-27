import type { NextFunction, Response } from "express";
import type { AuthenticatedRequest } from "../../../middlewares/auth.middleware.ts";
import { asyncHandler } from "../../../middlewares/error.middleware.ts";
import { statusCode } from "../../../types/types.ts";
import { ErrorResponse, SuccessResponse } from "../../../utils/response.util.ts";
import { RoleService } from "../services/role.service.ts";
import {
  assignRoleSchema,
  createPermissionSchema,
  createRoleSchema,
  updateRoleSchema,
} from "../validators/role.validator.ts";

/**
 * Helper to extract organizationId from the authenticated request
 */
const getOrganizationId = (req: AuthenticatedRequest): string => {
  const orgId =
    req.user?.organizationId ||
    (req.headers["x-organization-id"] as string) ||
    (req.query.organizationId as string);
  if (!orgId) {
    throw new ErrorResponse("Organization context not found. Please log in again.", statusCode.Bad_Request);
  }
  return orgId;
};

/**
 * @desc    Create a new permission node
 * @route   POST /api/v1/admin/permissions
 * @access  Private (Admin only)
 */
export const createPermission = asyncHandler(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const parsed = createPermissionSchema.safeParse(req.body);
  if (!parsed.success) {
    return next(parsed.error);
  }

  const permission = await RoleService.createPermission(parsed.data);

  return SuccessResponse(
    res,
    "Permission created successfully",
    permission,
    statusCode.Created
  );
});

/**
 * @desc    Get all permissions
 * @route   GET /api/v1/admin/permissions
 * @access  Private (Admin only)
 */
export const getPermissions = asyncHandler(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const permissions = await RoleService.getPermissions();

  return SuccessResponse(
    res,
    "Permissions retrieved successfully",
    permissions,
    statusCode.OK
  );
});

/**
 * @desc    Create a new role with associated permissions (scoped to user's organization)
 * @route   POST /api/v1/admin/roles
 * @access  Private (Admin only)
 */
export const createRole = asyncHandler(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const parsed = createRoleSchema.safeParse(req.body);
  if (!parsed.success) {
    return next(parsed.error);
  }

  const organizationId = getOrganizationId(req);
  const role = await RoleService.createRole(parsed.data, organizationId);

  return SuccessResponse(
    res,
    "Role created successfully",
    role,
    statusCode.Created
  );
});

/**
 * @desc    Get all roles with their permissions (scoped to user's organization)
 * @route   GET /api/v1/admin/roles
 * @access  Private (Admin only)
 */
export const getRoles = asyncHandler(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const organizationId = getOrganizationId(req);
  const roles = await RoleService.getRoles(organizationId);

  return SuccessResponse(
    res,
    "Roles retrieved successfully",
    roles,
    statusCode.OK
  );
});

/**
 * @desc    Update an existing role's name, description, and permissions (scoped to user's organization)
 * @route   PUT /api/v1/admin/roles/:id
 * @access  Private (Admin only)
 */
export const updateRole = asyncHandler(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const id = req.params.id as string;

  const parsed = updateRoleSchema.safeParse(req.body);
  if (!parsed.success) {
    return next(parsed.error);
  }

  const organizationId = getOrganizationId(req);
  const updatedRole = await RoleService.updateRole(id, parsed.data, organizationId);

  return SuccessResponse(
    res,
    "Role updated successfully",
    updatedRole,
    statusCode.OK
  );
});

/**
 * @desc    Delete a role (scoped to user's organization)
 * @route   DELETE /api/v1/admin/roles/:id
 * @access  Private (Admin only)
 */
export const deleteRole = asyncHandler(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const id = req.params.id as string;

  const organizationId = getOrganizationId(req);
  await RoleService.deleteRole(id, organizationId);

  return SuccessResponse(
    res,
    "Role deleted successfully",
    {},
    statusCode.OK
  );
});

/**
 * @desc    Assign a role to a user (scoped to user's organization)
 * @route   POST /api/v1/admin/assign-role
 * @access  Private (Admin only)
 */
export const assignRoleToUser = asyncHandler(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const parsed = assignRoleSchema.safeParse(req.body);
  if (!parsed.success) {
    return next(parsed.error);
  }

  const { userId, roleId } = parsed.data;
  const organizationId = getOrganizationId(req);
  const updatedUser = await RoleService.assignRoleToUser(userId, roleId || null, organizationId);

  return SuccessResponse(
    res,
    "Role assigned to user successfully",
    updatedUser,
    statusCode.OK
  );
});
