import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "../../../middlewares/auth.middleware.ts";
import { EngagementService } from "../services/engagement.service.ts";
import { SuccessResponse, ErrorResponse } from "../../../utils/response.util.ts";
import { asyncHandler } from "../../../middlewares/error.middleware.ts";
import { statusCode } from "../../../types/types.ts";
import {
  createPostSchema,
  createCommentSchema,
  toggleLikeSchema,
  submitReactionSchema,
  submitMoodSchema,
  submitSurveyResponseSchema,
  createSurveySchema,
} from "../validators/engagement.validator.ts";

// Posts & Comments
export const getPosts = asyncHandler(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const employeeId = req.query.employeeId as string | undefined;
  const posts = await EngagementService.getPosts(employeeId, req.user?.organizationId);

  return SuccessResponse(
    res,
    "Engagement posts retrieved successfully",
    posts,
    statusCode.OK
  );
});

export const createPost = asyncHandler(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const parsed = createPostSchema.safeParse(req.body);
  if (!parsed.success) {
    return next(parsed.error);
  }

  const post = await EngagementService.createPost(parsed.data, req.user?.organizationId);

  return SuccessResponse(
    res,
    "Post published on company feed successfully",
    post,
    statusCode.Created
  );
});

export const deletePost = asyncHandler(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const postId = req.params.id || req.body?.id || req.body?.postId || (req.query.id as string);
  if (!postId) {
    return next(new ErrorResponse("Post ID is required", statusCode.Bad_Request));
  }
  await EngagementService.deletePost(postId);

  return SuccessResponse(
    res,
    "Post removed from feed successfully",
    null,
    statusCode.OK
  );
});

export const addComment = asyncHandler(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const parsed = createCommentSchema.safeParse(req.body);
  if (!parsed.success) {
    return next(parsed.error);
  }

  const comment = await EngagementService.addComment(parsed.data);

  return SuccessResponse(
    res,
    "Comment added successfully",
    comment,
    statusCode.Created
  );
});

export const toggleLike = asyncHandler(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const parsed = toggleLikeSchema.safeParse(req.body);
  if (!parsed.success) {
    return next(parsed.error);
  }

  const post = await EngagementService.toggleLike(parsed.data.postId, parsed.data.employeeId);

  return SuccessResponse(
    res,
    "Post like toggled successfully",
    post,
    statusCode.OK
  );
});

export const addReaction = asyncHandler(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const parsed = submitReactionSchema.safeParse(req.body);
  if (!parsed.success) {
    return next(parsed.error);
  }

  const reaction = await EngagementService.addReaction(
    parsed.data.postId,
    parsed.data.employeeId,
    parsed.data.type
  );

  return SuccessResponse(
    res,
    "Reaction added to post successfully",
    reaction,
    statusCode.OK
  );
});

// Mood Gauge
export const submitMood = asyncHandler(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const parsed = submitMoodSchema.safeParse(req.body);
  if (!parsed.success) {
    return next(parsed.error);
  }

  const moodCheckin = await EngagementService.submitMood(
    parsed.data.employeeId,
    parsed.data.mood,
    parsed.data.weekKey
  );

  return SuccessResponse(
    res,
    "Mood check-in registered successfully",
    moodCheckin,
    statusCode.OK
  );
});

export const getMoodDistribution = asyncHandler(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const distribution = await EngagementService.getMoodDistribution(req.user?.organizationId);

  return SuccessResponse(
    res,
    "Mood distribution analytics retrieved successfully",
    distribution,
    statusCode.OK
  );
});

// Surveys
export const getSurveys = asyncHandler(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const employeeId = req.query.employeeId as string | undefined;
  const surveys = await EngagementService.getSurveys(employeeId, req.user?.organizationId);

  return SuccessResponse(
    res,
    "Active surveys retrieved successfully",
    surveys,
    statusCode.OK
  );
});

export const submitSurveyResponse = asyncHandler(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const parsed = submitSurveyResponseSchema.safeParse(req.body);
  if (!parsed.success) {
    return next(parsed.error);
  }

  const response = await EngagementService.submitSurveyResponse(
    parsed.data.surveyId,
    parsed.data.employeeId,
    parsed.data.rating
  );

  return SuccessResponse(
    res,
    "Survey feedback response saved successfully",
    response,
    statusCode.OK
  );
});

export const createSurvey = asyncHandler(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const parsed = createSurveySchema.safeParse(req.body);
  if (!parsed.success) {
    return next(parsed.error);
  }

  const survey = await EngagementService.createSurvey(
    parsed.data,
    req.user?.organizationId
  );

  return SuccessResponse(
    res,
    "Corporate pulse survey created successfully",
    survey,
    statusCode.Created
  );
});

export const deleteSurvey = asyncHandler(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const surveyId = req.params.id || req.body?.id || req.body?.surveyId || (req.query.id as string);
  if (!surveyId) {
    return next(new ErrorResponse("Survey ID is required", statusCode.Bad_Request));
  }
  await EngagementService.deleteSurvey(surveyId);

  return SuccessResponse(
    res,
    "Corporate survey removed successfully",
    null,
    statusCode.OK
  );
});
