import { prisma } from "../../../db/prisma.ts";

export class RoleRepository {
  // Permission Operations
  static async findPermissionByName(name: string) {
    return prisma.permission.findUnique({
      where: { name },
    });
  }

  static async createPermission(data: { name: string; description?: string; module?: string }) {
    return prisma.permission.create({
      data,
    });
  }

  static async findAllPermissions() {
    return prisma.permission.findMany({
      orderBy: { module: "asc" },
    });
  }

  static async findPermissionsByIds(ids: string[]) {
    if (!ids || ids.length === 0) return [];

    let found = await prisma.permission.findMany({
      where: {
        OR: [
          { id: { in: ids } },
          { name: { in: ids } },
        ],
      },
    });

    const foundIdentifiers = new Set([
      ...found.map((p) => p.id),
      ...found.map((p) => p.name),
    ]);

    const missingNames = ids.filter((id) => !foundIdentifiers.has(id));

    if (missingNames.length > 0) {
      for (const name of missingNames) {
        if (typeof name === "string" && (name.includes("_") || name === name.toUpperCase())) {
          try {
            const created = await prisma.permission.upsert({
              where: { name },
              update: {},
              create: {
                name,
                description: `Permission for ${name}`,
                module: name.split("_")[1]?.toLowerCase() || "general",
              },
            });
            found.push(created);
          } catch (e) {
            // Ignore concurrent creation error
          }
        }
      }
    }

    return found;
  }

  // Role Operations — now org-scoped
  static async findRoleByName(name: string, organizationId: string) {
    return prisma.role.findFirst({
      where: {
        name: { equals: name, mode: "insensitive" },
        OR: [
          { organizationId },
          { organizationId: null, isSystem: true },
        ],
      },
    });
  }

  static async findRoleById(id: string, includePermissions = true) {
    return prisma.role.findUnique({
      where: { id },
      include: {
        permissions: includePermissions,
      },
    });
  }

  static async createRole(data: {
    name: string;
    description?: string;
    permissionIds: string[];
    organizationId: string;
  }) {
    const { name, description, permissionIds, organizationId } = data;
    const dbPermissions = await RoleRepository.findPermissionsByIds(permissionIds);
    const actualIds = dbPermissions.map((p) => p.id);

    return prisma.role.create({
      data: {
        name,
        description,
        isSystem: false,
        organizationId,
        permissions: {
          connect: actualIds.map((id) => ({ id })),
        },
      },
      include: {
        permissions: true,
      },
    });
  }

  static async findAllRoles(organizationId: string) {
    const roles = await prisma.role.findMany({
      where: {
        OR: [
          { organizationId },
          { organizationId: null, isSystem: true },
        ],
      },
      include: {
        permissions: true,
      },
      orderBy: { name: "asc" },
    });

    // If an org-specific role exists with the same name as a global system role,
    // the org-specific role takes precedence (filter out duplicate global default)
    const orgRoleNames = new Set(
      roles.filter((r) => r.organizationId === organizationId).map((r) => r.name.toUpperCase())
    );

    return roles.filter(
      (r) => r.organizationId === organizationId || !orgRoleNames.has(r.name.toUpperCase())
    );
  }

  static async updateRole(
    id: string,
    data: { name?: string; description?: string; permissionIds?: string[] }
  ) {
    const { name, description, permissionIds } = data;
    const updateData: any = {
      name,
      description,
    };

    if (permissionIds) {
      const dbPermissions = await RoleRepository.findPermissionsByIds(permissionIds);
      const actualIds = dbPermissions.map((p) => p.id);
      updateData.permissions = {
        set: actualIds.map((permId) => ({ id: permId })),
      };
    }

    return prisma.role.update({
      where: { id },
      data: updateData,
      include: {
        permissions: true,
      },
    });
  }

  static async deleteRole(id: string) {
    return prisma.role.delete({
      where: { id },
    });
  }

  // User Operations
  static async findUserById(id: string) {
    const userById = await prisma.user.findUnique({
      where: { id },
    });
    if (userById) return userById;

    const userByEmail = await prisma.user.findUnique({
      where: { email: id },
    });
    if (userByEmail) return userByEmail;

    const userByPhone = await prisma.user.findUnique({
      where: { phone: id },
    });
    if (userByPhone) return userByPhone;

    const cleanInput = id.replace(/\D/g, "");
    if (cleanInput.length >= 10) {
      const allUsers = await prisma.user.findMany({
        where: {
          phone: { not: null }
        }
      });
      const matchingUser = allUsers.find(u => {
        const cleanPhone = u.phone?.replace(/\D/g, "");
        return cleanPhone === cleanInput || (cleanPhone && cleanPhone.endsWith(cleanInput)) || (cleanInput.endsWith(cleanPhone || ""));
      });
      if (matchingUser) return matchingUser;
    }

    return null;
  }

  static async updateUserRoleId(userId: string, roleId: string | null) {
    const user = await this.findUserById(userId);
    if (!user) {
      throw new Error(`User with identifier '${userId}' not found.`);
    }

    return prisma.user.update({
      where: { id: user.id },
      data: {
        roleId,
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }
}
