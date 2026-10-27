import { prisma } from "../../../db/prisma.ts";

export class EmployeeRepository {
  static async create(data: any) {
    return prisma.employee.create({
      data,
      include: {
        user: {
          include: { role: true },
        },
        department: true,
        manager: true,
      },
    });
  }

  static async findById(id: string) {
    return prisma.employee.findUnique({
      where: { id },
      include: {
        user: {
          include: { role: true },
        },
        department: true,
        manager: true,
        subordinates: true,
      },
    });
  }

  static async findByEmail(email: string) {
    return prisma.employee.findUnique({
      where: { email },
      include: {
        user: {
          include: { role: true },
        },
        department: true,
        manager: true,
      },
    });
  }

  static async findByUserId(userId: string) {
    return prisma.employee.findUnique({
      where: { userId },
    });
  }

  static async findAll(filters: {
    organizationId?: string;
    departmentId?: string;
    managerId?: string;
    status?: any;
    search?: string;
    userId?: string;
  }) {
    const whereClause: any = {};

    if (filters.organizationId) {
      whereClause.organizationId = filters.organizationId;
    }

    if (filters.userId) {
      whereClause.userId = filters.userId;
    }

    if (filters.departmentId) {
      whereClause.departmentId = filters.departmentId;
    }

    if (filters.managerId) {
      whereClause.managerId = filters.managerId;
    }

    if (filters.status) {
      whereClause.status = filters.status;
    }

    if (filters.search) {
      whereClause.OR = [
        { name: { contains: filters.search, mode: "insensitive" } },
        { email: { contains: filters.search, mode: "insensitive" } },
        { id: { contains: filters.search, mode: "insensitive" } },
      ];
    }

    // Exclude SUPER_ADMIN / Organization Admin accounts from Employee Directory
    whereClause.NOT = [
      { user: { role: { name: "SUPER_ADMIN" } } },
      { email: "info@symbosys.com" },
    ];

    return prisma.employee.findMany({
      where: whereClause,
      include: {
        user: {
          include: { role: true },
        },
        department: true,
        manager: true,
      },
      orderBy: { name: "asc" },
    });
  }

  static async update(id: string, data: any) {
    return prisma.employee.update({
      where: { id },
      data,
      include: {
        user: {
          include: { role: true },
        },
        department: true,
        manager: true,
      },
    });
  }

  static async delete(id: string) {
    return prisma.employee.delete({
      where: { id },
    });
  }

  static async findUserById(id: string) {
    return prisma.user.findUnique({
      where: { id },
    });
  }

  static async findDepartmentById(id: string) {
    return prisma.department.findUnique({
      where: { id },
    });
  }

  // Family Members & Dependents
  static async findFamilyMembers(employeeId: string) {
    return prisma.employeeFamily.findMany({
      where: { employeeId },
      orderBy: { createdAt: "desc" },
    });
  }

  static async createFamilyMember(employeeId: string, data: any) {
    return prisma.employeeFamily.create({
      data: {
        employeeId,
        name: data.name,
        relation: data.relation,
        dob: data.dob ? new Date(data.dob) : null,
        contact: data.contact || null,
        bloodGroup: data.bloodGroup || null,
        isNominee: data.isNominee ?? false,
        isInsuranceCovered: data.isInsuranceCovered ?? false,
      },
    });
  }

  static async deleteFamilyMember(id: string) {
    return prisma.employeeFamily.delete({
      where: { id },
    });
  }

  // Employee Exit & Clearance
  static async findExitByEmployeeId(employeeId: string) {
    try {
      return await prisma.employeeExit.findUnique({
        where: { employeeId },
      });
    } catch (error: any) {
      if (error?.code === "P2021" || error?.message?.includes("does not exist")) {
        console.warn(`[Employee Repo] employee_exits table does not exist in DB yet.`);
        return null;
      }
      throw error;
    }
  }

  static async upsertExit(employeeId: string, data: any) {
    try {
      return await prisma.employeeExit.upsert({
        where: { employeeId },
        update: {
          resignationDate: data.resignationDate,
          lastWorkingDay: data.lastWorkingDay,
          reason: data.reason || null,
          noticeDays: data.noticeDays ?? 30,
          leaveEncashDays: data.leaveEncashDays ?? 0,
          penaltyDeduction: data.penaltyDeduction ?? 0,
          itClearance: data.itClearance ?? false,
          financeClearance: data.financeClearance ?? false,
          adminClearance: data.adminClearance ?? false,
          hrClearance: data.hrClearance ?? false,
          status: data.status || "PENDING_CLEARANCE",
          settledDate: data.settledDate ? new Date(data.settledDate) : null,
          netPayable: data.netPayable ?? null,
        },
        create: {
          employeeId,
          resignationDate: data.resignationDate,
          lastWorkingDay: data.lastWorkingDay,
          reason: data.reason || null,
          noticeDays: data.noticeDays ?? 30,
          leaveEncashDays: data.leaveEncashDays ?? 0,
          penaltyDeduction: data.penaltyDeduction ?? 0,
          itClearance: data.itClearance ?? false,
          financeClearance: data.financeClearance ?? false,
          adminClearance: data.adminClearance ?? false,
          hrClearance: data.hrClearance ?? false,
          status: data.status || "PENDING_CLEARANCE",
          settledDate: data.settledDate ? new Date(data.settledDate) : null,
          netPayable: data.netPayable ?? null,
        },
      });
    } catch (error: any) {
      if (error?.code === "P2021" || error?.message?.includes("does not exist")) {
        console.warn(`[Employee Repo] employee_exits table does not exist in DB yet.`);
        return null;
      }
    }
  }
}

