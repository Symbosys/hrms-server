import { prisma } from "../../../db/prisma.ts";

export class EngagementRepository {
  // Feed Announcements
  static async findPosts(employeeId?: string, organizationId?: string) {
    // Purge any previously auto-seeded static/dummy posts
    try {
      await prisma.engagementPost.deleteMany({
        where: {
          content: {
            in: [
              "Welcome to our company portal! Let's collaborate and achieve great milestones together.",
              "Announcing the WFH Hybrid Policy Review 2026. Please share your feedback in the Surveys tab."
            ]
          }
        }
      });
    } catch {
      // Ignore if already deleted
    }

    const where: any = {};
    if (organizationId) {
      where.organizationId = organizationId;
    }

    const posts = await prisma.engagementPost.findMany({
      where,
      include: {
        comments: {
          orderBy: { createdAt: "asc" },
        },
        likes: true,
        reactions: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return posts.map((post) => {
      const likedByMe = employeeId
        ? post.likes.some((l) => l.employeeId === employeeId)
        : false;

      // Group reactions by type for ease of display
      const groupedReactionsMap = new Map<string, number>();
      post.reactions.forEach((r) => {
        groupedReactionsMap.set(r.type, (groupedReactionsMap.get(r.type) || 0) + 1);
      });

      const reactions = [
        { type: "👍", count: groupedReactionsMap.get("👍") || 0 },
        { type: "❤️", count: groupedReactionsMap.get("❤️") || 0 },
      ];

      return {
        id: post.id,
        author: post.authorName,
        authorRole: post.authorRole,
        authorAvatar: post.authorAvatar || null,
        content: post.content,
        image: post.image,
        likes: post.likesCount,
        likedByMe,
        reactions,
        organizationId: post.organizationId,
        comments: post.comments.map((c) => ({
          id: c.id,
          user: c.userName,
          text: c.text,
          date: c.createdAt.toLocaleString(),
        })),
        date: post.createdAt.toLocaleString(),
      };
    });
  }

  static async createPost(data: any) {
    return prisma.engagementPost.create({
      data,
    });
  }

  static async deletePost(id: string) {
    return prisma.engagementPost.delete({
      where: { id },
    });
  }

  static async addComment(data: { postId: string; userName: string; text: string }) {
    return prisma.engagementComment.create({
      data,
    });
  }

  static async toggleLike(postId: string, employeeId: string) {
    const existing = await prisma.engagementPostLike.findUnique({
      where: {
        postId_employeeId: { postId, employeeId },
      },
    });

    if (existing) {
      // Remove like
      await prisma.engagementPostLike.delete({
        where: { id: existing.id },
      });
      // Decrement count
      return prisma.engagementPost.update({
        where: { id: postId },
        data: {
          likesCount: { decrement: 1 },
        },
      });
    } else {
      // Add like
      await prisma.engagementPostLike.create({
        data: { postId, employeeId },
      });
      // Increment count
      return prisma.engagementPost.update({
        where: { id: postId },
        data: {
          likesCount: { increment: 1 },
        },
      });
    }
  }

  static async addReaction(postId: string, employeeId: string, type: string) {
    return prisma.engagementPostReaction.upsert({
      where: {
        postId_employeeId_type: { postId, employeeId, type },
      },
      update: {}, // No action if already reacted
      create: {
        postId,
        employeeId,
        type,
      },
    });
  }

  // Mood Gauge
  static async submitMood(employeeId: string, mood: string, weekKey: string) {
    return prisma.engagementMood.upsert({
      where: {
        employeeId_weekKey: { employeeId, weekKey },
      },
      update: { mood },
      create: {
        employeeId,
        mood,
        weekKey,
      },
    });
  }

  static async getMoodDistribution(organizationId?: string) {
    const where: any = {};
    if (organizationId) {
      where.employee = { organizationId };
    }

    const moods = await prisma.engagementMood.findMany({
      where,
      select: { mood: true },
    });

    const total = moods.length;
    const counts: Record<string, number> = {
      THRILLED: 0,
      CONTENT: 0,
      NEUTRAL: 0,
      STRESSED: 0,
    };

    moods.forEach((m) => {
      const current = counts[m.mood];
      if (typeof current === "number") {
        counts[m.mood] = current + 1;
      }
    });

    const thrilledPct = total > 0 ? Math.round(((counts.THRILLED || 0) / total) * 100) : 0;
    const contentPct = total > 0 ? Math.round(((counts.CONTENT || 0) / total) * 100) : 0;
    const neutralPct = total > 0 ? Math.round(((counts.NEUTRAL || 0) / total) * 100) : 0;
    const stressedPct = total > 0 ? Math.round(((counts.STRESSED || 0) / total) * 100) : 0;

    return {
      thrilled: thrilledPct,
      content: contentPct,
      neutral: neutralPct,
      stressed: stressedPct,
      totalResponses: total,
    };
  }

  // Surveys
  static async findSurveys(employeeId?: string, organizationId?: string) {
    // Purge any previously auto-seeded static/dummy surveys
    try {
      await prisma.corporateSurvey.deleteMany({
        where: {
          title: {
            in: [
              "WFH Hybrid Policy Review 2026",
              "Q3 Work-Life Balance & Remote Policy Pulse",
              "Office Cafeteria & Wellness Amenities Survey",
              "Q2 Engineering Tooling & DevOps Infrastructure"
            ]
          }
        }
      });
    } catch {
      // Ignore if already deleted
    }

    const where: any = {};
    if (organizationId) {
      where.organizationId = organizationId;
    }

    const surveys = await prisma.corporateSurvey.findMany({
      where,
      include: {
        responses: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return surveys.map((s) => {
      const responded = employeeId
        ? s.responses.some((r) => r.employeeId === employeeId)
        : false;

      return {
        id: s.id,
        title: s.title,
        question: s.question,
        status: s.status,
        closesAt: s.closesAt,
        organizationId: s.organizationId,
        responded,
      };
    });
  }

  static async submitSurveyResponse(surveyId: string, employeeId: string, rating: number) {
    return prisma.corporateSurveyResponse.upsert({
      where: {
        surveyId_employeeId: { surveyId, employeeId },
      },
      update: { rating },
      create: {
        surveyId,
        employeeId,
        rating,
      },
    });
  }

  static async createSurvey(data: { title: string; question: string; closesAt: Date; organizationId?: string | null }) {
    return prisma.corporateSurvey.create({
      data,
    });
  }

  static async deleteSurvey(id: string) {
    return prisma.corporateSurvey.delete({
      where: { id },
    });
  }
}
