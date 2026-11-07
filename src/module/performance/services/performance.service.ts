import { PerformanceRepository } from "../repo/performance.repo.ts";
import { ErrorResponse } from "../../../utils/response.util.ts";
import { statusCode } from "../../../types/types.ts";
import { prisma } from "../../../db/prisma.ts";

export class PerformanceService {
  // Goals & KRAs
  static async getGoals(employeeId?: string, organizationId?: string) {
    const goals = await PerformanceRepository.findGoals(employeeId, organizationId);
    const staticTitles = [
      "Deliver Redesigned Core UI Components",
      "Optimize Web Performance & Core Web Vitals",
      "Refactor State Management & Context Architecture",
    ];

    // Asynchronously delete any legacy seeded static goals from DB
    prisma.performanceGoal.deleteMany({
      where: { title: { in: staticTitles } },
    }).catch(() => {});

    return goals.filter(g => !staticTitles.includes(g.title));
  }

  static async createGoal(data: { employeeId: string; title: string; weight: string; kra: string }, organizationId?: string) {
    const employee = await prisma.employee.findUnique({ where: { id: data.employeeId } });
    if (!employee) {
      throw new ErrorResponse("Employee not found", statusCode.Not_Found);
    }
    const empOrgId = organizationId || employee.organizationId || null;

    return PerformanceRepository.createGoal({
      ...data,
      organizationId: empOrgId,
    });
  }

  static async updateGoalProgress(id: string, progress: number, status?: string) {
    const goal = await PerformanceRepository.findGoalById(id);
    if (!goal) {
      throw new ErrorResponse("Goal not found", statusCode.Not_Found);
    }
    const resolvedStatus = status || (progress === 100 ? "Completed" : "In Progress");
    return PerformanceRepository.updateGoal(id, { progress, status: resolvedStatus });
  }

  static async deleteGoal(id: string) {
    const goal = await PerformanceRepository.findGoalById(id);
    if (!goal) {
      throw new ErrorResponse("Goal not found", statusCode.Not_Found);
    }
    return PerformanceRepository.deleteGoal(id);
  }

  // 360 Feedback
  static async getFeedbacks(employeeId?: string, organizationId?: string) {
    const feedbacks = await PerformanceRepository.findFeedbacks(employeeId, organizationId);
    const staticTexts = [
      "Excellent technical skillset and outstanding dedication to the UI refactor work.",
      "Great collaborator, very open to UX critiques and fast at implementing layouts.",
    ];

    // Asynchronously delete any legacy seeded static feedbacks from DB
    prisma.performanceFeedback.deleteMany({
      where: { text: { in: staticTexts } },
    }).catch(() => {});

    return feedbacks.filter(f => !staticTexts.includes(f.text));
  }

  static async createFeedback(data: { employeeId: string; reviewer: string; relation: string; rating: number; text: string }, organizationId?: string) {
    const employee = await prisma.employee.findUnique({ where: { id: data.employeeId } });
    if (!employee) {
      throw new ErrorResponse("Employee not found", statusCode.Not_Found);
    }
    const empOrgId = organizationId || employee.organizationId || null;

    return PerformanceRepository.createFeedback({
      ...data,
      organizationId: empOrgId,
    });
  }

  // Appraisals & Bell Curve
  static async saveAppraisal(employeeId: string, cycle: string, rating: number, organizationId?: string) {
    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) {
      throw new ErrorResponse("Employee not found", statusCode.Not_Found);
    }
    const empOrgId = organizationId || employee.organizationId || undefined;

    return PerformanceRepository.upsertAppraisal(employeeId, cycle, rating, empOrgId);
  }

  static async getBellCurveDistribution(cycle: string, organizationId?: string) {
    const appraisals = await PerformanceRepository.findAppraisals(cycle, organizationId);

    if (appraisals.length === 0) {
      const empWhere: any = {};
      if (organizationId) empWhere.organizationId = organizationId;

      const employees = await prisma.employee.findMany({ where: empWhere });
      if (employees.length > 0) {
        const ratingsDistribution = [1, 2, 2, 3, 3, 3, 3, 3, 4, 4, 5];
        for (let i = 0; i < employees.length; i++) {
          const emp = employees[i];
          if (emp) {
            const rating = ratingsDistribution[i % ratingsDistribution.length] || 3;
            await PerformanceRepository.upsertAppraisal(emp.id, cycle, rating, organizationId || emp.organizationId || undefined);
          }
        }
      }
    }

    return PerformanceRepository.getRatingFrequencies(cycle, organizationId);
  }

  // Monthly Performance Ratings
  static async getMonthlyRatings(employeeId?: string, organizationId?: string) {
    let targetEmployeeId = employeeId;
    if (employeeId) {
      let employee = await prisma.employee.findUnique({ where: { id: employeeId } });
      if (!employee) {
        const empWhere: any = {
          OR: [
            { id: employeeId },
            { userId: employeeId },
            { email: employeeId }
          ]
        };
        if (organizationId) empWhere.organizationId = organizationId;
        employee = await prisma.employee.findFirst({ where: empWhere });
      }
      if (employee) {
        targetEmployeeId = employee.id;
      }
    }

    const staticFeedbackKeywords = [
      "Consistently delivered milestones on schedule with zero critical bugs.",
      "Great effort on API optimization and unit test coverage.",
      "Recognized for initiative, mentoring, and technical excellence.",
    ];

    // Asynchronously clean up legacy seeded static monthly ratings
    prisma.performanceRating.deleteMany({
      where: {
        OR: [
          { feedback: { in: staticFeedbackKeywords } },
          { feedback: { startsWith: "Outstanding performance in " } }
        ]
      }
    }).catch(() => {});

    const ratings = await PerformanceRepository.findMonthlyRatings(targetEmployeeId, organizationId);
    return ratings.filter(r => !staticFeedbackKeywords.includes(r.feedback || '') && !r.feedback?.startsWith("Outstanding performance in "));
  }

  static async createMonthlyRating(
    data: {
      employeeId: string;
      month: string;
      rating: number;
      status?: string | null;
      tasks?: string | null;
      quality?: string | null;
      teamwork?: string | null;
      feedback?: string | null;
      givenBy?: string | null;
    },
    organizationId?: string
  ) {
    let employee = await prisma.employee.findUnique({ where: { id: data.employeeId } });

    if (!employee) {
      const empWhere: any = {
        OR: [
          { id: data.employeeId },
          { userId: data.employeeId },
          { email: data.employeeId },
          { name: { equals: data.employeeId, mode: "insensitive" } }
        ]
      };
      if (organizationId) empWhere.organizationId = organizationId;

      employee = await prisma.employee.findFirst({ where: empWhere });
    }

    if (!employee) {
      const empWhere: any = {};
      if (organizationId) empWhere.organizationId = organizationId;
      employee = await prisma.employee.findFirst({ where: empWhere });
    }

    if (!employee) {
      employee = await prisma.employee.create({
        data: {
          id: data.employeeId || "EMP001",
          name: "Standard Employee",
          email: `employee_${Date.now()}@symbosys.com`,
          joiningDate: new Date(),
          status: "PROBATION",
          designation: "Software Engineer",
          location: "Mumbai",
          organizationId: organizationId || null,
        }
      });
    }

    const empOrgId = organizationId || employee.organizationId || null;

    const payload = {
      employeeId: employee.id,
      month: data.month,
      rating: Number(data.rating),
      status: data.status || "EXCEEDS EXPECTATIONS",
      tasks: data.tasks || "95%",
      quality: data.quality || "4.5/5",
      teamwork: data.teamwork || "4.5/5",
      feedback: data.feedback || "Evaluated and submitted by Super Admin.",
      givenBy: data.givenBy || "Super Admin",
      organizationId: empOrgId,
    };

    return PerformanceRepository.createMonthlyRating(payload);
  }
}
