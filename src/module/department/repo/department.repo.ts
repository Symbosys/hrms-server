import { prisma } from "../../../db/prisma.ts";

export class DepartmentRepository {
  static async create(data: {
    name: string;
    code: string;
    description?: string | null;
    managerId?: string | null;
    parentId?: string | null;
    organizationId?: string | null;
  }) {
    return prisma.department.create({
      data: {
        name: data.name,
        code: data.code,
        description: data.description,
        managerId: data.managerId || null,
        parentId: data.parentId || null,
        organizationId: data.organizationId || null,
      },
      include: {
        manager: true,
        parent: true,
      },
    });
  }

  static async findById(id: string) {
    return prisma.department.findUnique({
      where: { id },
      include: {
        manager: true,
        parent: true,
        children: true,
      },
    });
  }

  static async findByName(name: string, organizationId?: string) {
    const where: any = {
      name: {
        equals: name.trim(),
        mode: "insensitive"
      }
    };
    if (organizationId) {
      where.organizationId = organizationId;
    }
    return prisma.department.findFirst({ where });
  }

  static async findByCode(code: string, organizationId?: string) {
    const where: any = {
      code: {
        equals: code.trim().toUpperCase(),
        mode: "insensitive"
      }
    };
    if (organizationId) {
      where.organizationId = organizationId;
    }
    return prisma.department.findFirst({ where });
  }

  static async findAll(organizationId?: string) {
    const where: any = {};
    if (organizationId) {
      where.OR = [
        { organizationId },
        { organizationId: null }
      ];
    }
    return prisma.department.findMany({
      where,
      include: {
        manager: true,
        parent: true,
      },
      orderBy: { name: "asc" },
    });
  }

  static async update(
    id: string,
    data: {
      name?: string;
      code?: string;
      description?: string | null;
      managerId?: string | null;
      parentId?: string | null;
    }
  ) {
    return prisma.department.update({
      where: { id },
      data: {
        name: data.name,
        code: data.code,
        description: data.description,
        managerId: data.managerId,
        parentId: data.parentId,
      },
      include: {
        manager: true,
        parent: true,
      },
    });
  }

  static async delete(id: string) {
    return prisma.department.delete({
      where: { id },
    });
  }

  static async findUserById(id: string) {
    // 1. Direct match by User ID
    let user = await prisma.user.findUnique({
      where: { id },
    });
    if (user) return user;

    // 2. Match by Employee ID (EMP-xxxxxx)
    const employee = await prisma.employee.findUnique({
      where: { id },
      include: { user: true }
    });
    if (employee) {
      if (employee.user) return employee.user;

      // Auto-create User account for Employee if not exists
      const newUser = await prisma.user.create({
        data: {
          name: employee.name,
          email: employee.email,
          phone: employee.phone,
        }
      });

      // Link Employee to the new User account
      await prisma.employee.update({
        where: { id: employee.id },
        data: { userId: newUser.id }
      });

      return newUser;
    }

    // 3. Match by email
    user = await prisma.user.findUnique({
      where: { email: id },
    });
    if (user) return user;

    // 4. Match by phone
    user = await prisma.user.findUnique({
      where: { phone: id },
    });
    if (user) return user;

    return null;
  }
}
