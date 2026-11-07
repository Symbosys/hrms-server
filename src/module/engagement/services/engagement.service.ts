import { EngagementRepository } from "../repo/engagement.repo.ts";
import { ErrorResponse } from "../../../utils/response.util.ts";
import { statusCode } from "../../../types/types.ts";
import { prisma } from "../../../db/prisma.ts";

export class EngagementService {
  // Feed Announcements
  static async getPosts(employeeId?: string, organizationId?: string) {
    return EngagementRepository.findPosts(employeeId, organizationId);
  }

  static async createPost(
    data: { authorName: string; authorRole: string; authorAvatar?: string | null; content: string; image?: string | null },
    organizationId?: string
  ) {
    return EngagementRepository.createPost({
      ...data,
      organizationId: organizationId || null,
    });
  }

  static async deletePost(postId: string) {
    const post = await prisma.engagementPost.findUnique({ where: { id: postId } });
    if (!post) {
      throw new ErrorResponse("Post not found", statusCode.Not_Found);
    }
    return EngagementRepository.deletePost(postId);
  }

  static async addComment(data: { postId: string; userName: string; text: string }) {
    const post = await prisma.engagementPost.findUnique({ where: { id: data.postId } });
    if (!post) {
      throw new ErrorResponse("Post not found", statusCode.Not_Found);
    }
    return EngagementRepository.addComment(data);
  }

  static async toggleLike(postId: string, employeeId: string) {
    const post = await prisma.engagementPost.findUnique({ where: { id: postId } });
    if (!post) {
      throw new ErrorResponse("Post not found", statusCode.Not_Found);
    }
    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) {
      throw new ErrorResponse("Employee not found", statusCode.Not_Found);
    }
    return EngagementRepository.toggleLike(postId, employeeId);
  }

  static async addReaction(postId: string, employeeId: string, type: string) {
    const post = await prisma.engagementPost.findUnique({ where: { id: postId } });
    if (!post) {
      throw new ErrorResponse("Post not found", statusCode.Not_Found);
    }
    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) {
      throw new ErrorResponse("Employee not found", statusCode.Not_Found);
    }
    return EngagementRepository.addReaction(postId, employeeId, type);
  }

  // Mood
  static async submitMood(employeeId: string, mood: string, weekKey: string) {
    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) {
      throw new ErrorResponse("Employee not found", statusCode.Not_Found);
    }
    return EngagementRepository.submitMood(employeeId, mood, weekKey);
  }

  static async getMoodDistribution(organizationId?: string) {
    return EngagementRepository.getMoodDistribution(organizationId);
  }

  // Surveys
  static async getSurveys(employeeId?: string, organizationId?: string) {
    return EngagementRepository.findSurveys(employeeId, organizationId);
  }

  static async createSurvey(
    data: { title: string; question: string; closesAt: Date },
    organizationId?: string
  ) {
    return EngagementRepository.createSurvey({
      ...data,
      organizationId: organizationId || null,
    });
  }

  static async deleteSurvey(surveyId: string) {
    const survey = await prisma.corporateSurvey.findUnique({ where: { id: surveyId } });
    if (!survey) {
      throw new ErrorResponse("Survey not found", statusCode.Not_Found);
    }
    return EngagementRepository.deleteSurvey(surveyId);
  }

  static async submitSurveyResponse(surveyId: string, employeeId: string, rating: number) {
    const survey = await prisma.corporateSurvey.findUnique({ where: { id: surveyId } });
    if (!survey) {
      throw new ErrorResponse("Survey not found", statusCode.Not_Found);
    }
    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) {
      throw new ErrorResponse("Employee not found", statusCode.Not_Found);
    }
    return EngagementRepository.submitSurveyResponse(surveyId, employeeId, rating);
  }
}
