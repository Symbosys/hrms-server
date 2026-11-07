import { z } from "zod";

export const createPostSchema = z.object({
  authorName: z.string({ message: "Author name is required" }).min(1),
  authorRole: z.string({ message: "Author role is required" }).min(1),
  authorAvatar: z.string().optional().nullable(),
  content: z.string({ message: "Post content is required" }).min(1),
  image: z.string().optional().nullable(),
});

export const createCommentSchema = z.object({
  postId: z.string({ message: "Post ID is required" }),
  userName: z.string({ message: "Username is required" }).min(1),
  text: z.string({ message: "Comment content is required" }).min(1),
});

export const toggleLikeSchema = z.object({
  postId: z.string({ message: "Post ID is required" }),
  employeeId: z.string({ message: "Employee ID is required" }),
});

export const submitReactionSchema = z.object({
  postId: z.string({ message: "Post ID is required" }),
  employeeId: z.string({ message: "Employee ID is required" }),
  type: z.string({ message: "Reaction type emoji is required" }).min(1),
});

export const submitMoodSchema = z.object({
  employeeId: z.string({ message: "Employee ID is required" }),
  mood: z.enum(["THRILLED", "CONTENT", "NEUTRAL", "STRESSED"], {
    message: "Invalid mood type value",
  }),
  weekKey: z.string({ message: "Week key identifier is required" }).min(1),
});

export const submitSurveyResponseSchema = z.object({
  surveyId: z.string({ message: "Survey ID is required" }),
  employeeId: z.string({ message: "Employee ID is required" }),
  rating: z.number().int().min(1).max(5),
});

export const createSurveySchema = z.object({
  title: z.string({ message: "Survey title is required" }).min(1),
  question: z.string({ message: "Survey question is required" }).min(1),
  closesAt: z.union([z.string(), z.date()]).transform((val) => new Date(val)),
});
