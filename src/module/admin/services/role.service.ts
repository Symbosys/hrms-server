import { prisma } from "../../../db/prisma.ts";
import { statusCode } from "../../../types/types.ts";
import { ErrorResponse } from "../../../utils/response.util.ts";
import { RoleRepository } from "../repo/role.repo.ts";

export class RoleService {
  // Permission Services (permissions are global, not org-scoped)
  static async createPermission(data: { name: string; description?: string; module?: string }) {
    const existingPermission = await RoleRepository.findPermissionByName(data.name);
    if (existingPermission) {
      throw new ErrorResponse("Permission with this name already exists", statusCode.Conflict);
    }
    return RoleRepository.createPermission(data);
  }

  static async getPermissions() {
    return RoleRepository.findAllPermissions();
  }

  // Role Services — now org-scoped
  static async createRole(
    data: { name: string; description?: string; permissionIds: string[] },
    organizationId: string
  ) {
    if (!organizationId) {
      throw new ErrorResponse("Organization context is required to create a role", statusCode.Bad_Request);
    }

    const existingRole = await RoleRepository.findRoleByName(data.name, organizationId);
    if (existingRole) {
      throw new ErrorResponse("Role with this name already exists in your organization", statusCode.Conflict);
    }

    const uniqueIds = Array.from(new Set(data.permissionIds || []));
    const dbPermissions = await RoleRepository.findPermissionsByIds(uniqueIds);
    if (dbPermissions.length !== uniqueIds.length) {
      throw new ErrorResponse("One or more permission IDs are invalid", statusCode.Bad_Request);
    }

    return RoleRepository.createRole({
      ...data,
      organizationId,
    });
  }

  static async getRoles(organizationId: string) {
    if (!organizationId) {
      throw new ErrorResponse("Organization context is required to list roles", statusCode.Bad_Request);
    }

    return RoleRepository.findAllRoles(organizationId);
  }

  static async updateRole(
    id: string,
    data: { name?: string; description?: string; permissionIds?: string[] },
    organizationId: string
  ) {
    const role = await RoleRepository.findRoleById(id, false);
    if (!role) {
      throw new ErrorResponse("Role not found", statusCode.Not_Found);
    }

    // Ensure the role belongs to the requesting organization
    if (role.organizationId !== organizationId) {
      throw new ErrorResponse("You do not have permission to modify this role", statusCode.Forbidden);
    }

    if (role.isSystem && data.name && data.name !== role.name) {
      throw new ErrorResponse("System roles cannot be renamed", statusCode.Forbidden);
    }

    if (data.name && data.name !== role.name) {
      const existingRole = await RoleRepository.findRoleByName(data.name, organizationId);
      if (existingRole) {
        throw new ErrorResponse("Role name already in use in your organization", statusCode.Conflict);
      }
    }

    if (data.permissionIds) {
      const uniqueIds = Array.from(new Set(data.permissionIds));
      const dbPermissions = await RoleRepository.findPermissionsByIds(uniqueIds);
      if (dbPermissions.length !== uniqueIds.length) {
        throw new ErrorResponse("One or more permission IDs are invalid", statusCode.Bad_Request);
      }
    }

    return RoleRepository.updateRole(id, data);
  }

  static async deleteRole(id: string, organizationId: string) {
    const role = await RoleRepository.findRoleById(id, false);
    if (!role) {
      throw new ErrorResponse("Role not found", statusCode.Not_Found);
    }

    // Ensure the role belongs to the requesting organization
    if (role.organizationId !== organizationId) {
      throw new ErrorResponse("You do not have permission to delete this role", statusCode.Forbidden);
    }

    if (role.isSystem) {
      throw new ErrorResponse("System roles cannot be deleted", statusCode.Forbidden);
    }

    return RoleRepository.deleteRole(id);
  }

  // User Assignment — verify both user and role belong to same org
  static async assignRoleToUser(userId: string, roleId: string | null, organizationId: string) {
    if (!organizationId) {
      throw new ErrorResponse("Organization context is required to assign roles", statusCode.Bad_Request);
    }

    let resolvedRole: any = null;
    let targetRoleId: string | null = roleId;

    if (roleId) {
      // Find role by ID or Name
      resolvedRole = await RoleRepository.findRoleById(roleId, false);
      if (!resolvedRole) {
        resolvedRole = await RoleRepository.findRoleByName(roleId, organizationId);
      }
      if (resolvedRole) {
        // Multi-tenant check: ensure role belongs to the organization OR is a global system default role
        if (resolvedRole.organizationId && resolvedRole.organizationId !== organizationId) {
          throw new ErrorResponse("Role does not belong to your organization", statusCode.Forbidden);
        }
        targetRoleId = resolvedRole.id;
      } else {
        throw new ErrorResponse(`Role '${roleId}' not found in your organization context.`, statusCode.Not_Found);
      }
    }

    let user = await RoleRepository.findUserById(userId);

    // If User is not found, check if there is an Employee matching this identifier (id, email, or phone)
    if (!user) {
      const employee = await prisma.employee.findFirst({
        where: {
          OR: [
            { id: userId },
            { email: userId },
            { phone: userId }
          ]
        }
      });

      if (employee) {
        // Automatically create a User account for the Employee on-the-fly
        user = await prisma.user.create({
          data: {
            name: employee.name,
            email: employee.email,
            phone: employee.phone,
            roleId: targetRoleId
          }
        });

        // Link the Employee to the new User account
        await prisma.employee.update({
          where: { id: employee.id },
          data: {
            userId: user.id
          }
        });

        // Create membership for the user in the organization
        await prisma.membership.create({
          data: {
            userId: user.id,
            organizationId,
            roleId: targetRoleId,
            status: "ACTIVE",
          }
        });

        return user;
      }

      throw new ErrorResponse("User not found and no matching employee record could be resolved to auto-create user account.", statusCode.Not_Found);
    }

    // Ensure the Employee record is correctly linked to this User and has updated role name
    const matchingEmployee = await prisma.employee.findFirst({
      where: {
        OR: [
          { userId: user.id },
          { id: userId },
          { email: user.email || undefined },
          { phone: user.phone || undefined }
        ]
      }
    });

    if (matchingEmployee) {
      await prisma.employee.update({
        where: { id: matchingEmployee.id },
        data: {
          userId: user.id
        }
      });
    }

    // Update the user's roleId
    const updatedUser = await RoleRepository.updateUserRoleId(user.id, targetRoleId);

    // Also update or create the membership roleId for this org
    const membership = await prisma.membership.findFirst({
      where: { userId: user.id, organizationId },
    });
    if (membership) {
      await prisma.membership.update({
        where: { id: membership.id },
        data: { roleId: targetRoleId },
      });
    } else if (organizationId) {
      await prisma.membership.create({
        data: {
          userId: user.id,
          organizationId,
          roleId: targetRoleId,
          status: "ACTIVE",
        },
      });
    }

    return updatedUser;
  }
}
