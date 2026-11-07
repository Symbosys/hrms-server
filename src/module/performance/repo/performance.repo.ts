import { prisma } from "../../../db/prisma.ts";

export class PerformanceRepository {
  // Goals & KRAs
  static async findGoals(employeeId?: string, organizationId?: string) {
    const where: any = {};
    if (employeeId) where.employeeId = employeeId;
    if (organizationId) where.organizationId = organizationId;

    return prisma.performanceGoal.findMany({
      where,
      include: { employee: true },
      orderBy: { createdAt: "desc" },
    });
  }

  static async findGoalById(id: string) {
    return prisma.performanceGoal.findUnique({
      where: { id },
    });
  }

  static async createGoal(data: any) {
    return prisma.performanceGoal.create({
      data,
    });
  }

  static async updateGoal(id: string, data: any) {
    return prisma.performanceGoal.update({
      where: { id },
      data,
    });
  }

  static async deleteGoal(id: string) {
    return prisma.performanceGoal.delete({
      where: { id },
    });
  }

  // 360 Feedback
  static async findFeedbacks(employeeId?: string, organizationId?: string) {
    const where: any = {};
    if (employeeId) where.employeeId = employeeId;
    if (organizationId) where.organizationId = organizationId;

    return prisma.performanceFeedback.findMany({
      where,
      include: { employee: true },
      orderBy: { date: "desc" },
    });
  }

  static async createFeedback(data: any) {
    return prisma.performanceFeedback.create({
      data,
    });
  }

  // Appraisals & Bell Curve
  static async findAppraisals(cycle: string, organizationId?: string) {
    const where: any = { cycle };
    if (organizationId) where.organizationId = organizationId;

    return prisma.performanceAppraisal.findMany({
      where,
      include: { employee: true },
    });
  }

  static async upsertAppraisal(employeeId: string, cycle: string, rating: number, organizationId?: string) {
    return prisma.performanceAppraisal.upsert({
      where: {
        employeeId_cycle: { employeeId, cycle },
      },
      update: { rating, organizationId: organizationId || undefined },
      create: {
        employeeId,
        cycle,
        rating,
        status: "COMPLETED",
        organizationId: organizationId || null,
      },
    });
  }

  static async getRatingFrequencies(cycle: string, organizationId?: string) {
    const where: any = { cycle };
    if (organizationId) where.organizationId = organizationId;

    const appraisals = await prisma.performanceAppraisal.findMany({
      where,
      select: { rating: true },
    });

    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    appraisals.forEach((app) => {
      const current = counts[app.rating];
      if (typeof current === "number") {
        counts[app.rating] = current + 1;
      }
    });

    return [
      { rating: "Unsatisfactory (1)", Employees: counts[1] || 0 },
      { rating: "Needs Improvement (2)", Employees: counts[2] || 0 },
      { rating: "Meets Expectations (3)", Employees: counts[3] || 0 },
      { rating: "Exceeds Expectations (4)", Employees: counts[4] || 0 },
      { rating: "Outstanding (5)", Employees: counts[5] || 0 },
    ];
  }

  // Monthly Performance Ratings
  static async findMonthlyRatings(employeeId?: string, organizationId?: string) {
    const where: any = {};
    if (employeeId) where.employeeId = employeeId;
    if (organizationId) where.organizationId = organizationId;

    return prisma.performanceRating.findMany({
      where,
      include: { employee: true },
      orderBy: { createdAt: "desc" },
    });
  }

  static async createMonthlyRating(data: any) {
    return prisma.performanceRating.create({
      data,
    });
  }
}
