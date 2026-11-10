import { Router } from "express";
import { protect, hasPermission } from "../../../middlewares/auth.middleware.ts";
import {
  getGoals,
  createGoal,
  updateGoalProgress,
  deleteGoal,
  getFeedbacks,
  createFeedback,
  getBellCurveDistribution,
  saveAppraisal,
  getMonthlyRatings,
  createMonthlyRating,
} from "../controllers/performance.controller.ts";

const router = Router();

// Protect all performance management routes
router.use(protect);

// 1. KRA & Goals Routes
router.get("/goals", hasPermission("VIEW_KRA_GOALS", "VIEW_PERFORMANCE"), getGoals);
router.post("/goals", hasPermission("CREATE_KRA_GOALS", "CREATE_PERFORMANCE"), createGoal);
router.patch("/goals/:id/progress", hasPermission("UPDATE_KRA_GOALS", "UPDATE_PERFORMANCE"), updateGoalProgress);
router.delete("/goals/:id", hasPermission("UPDATE_KRA_GOALS", "UPDATE_PERFORMANCE", "CREATE_KRA_GOALS"), deleteGoal);

// 2. Feedback Routes
router.get("/feedbacks", hasPermission("VIEW_FEEDBACK_360", "VIEW_PERFORMANCE"), getFeedbacks);
router.post("/feedbacks", hasPermission("CREATE_FEEDBACK_360", "CREATE_PERFORMANCE"), createFeedback);

// 3. Appraisals & Bell Curve Routes
router.get("/bellcurve", hasPermission("VIEW_BELLCURVE_ANALYTICS", "VIEW_PERFORMANCE"), getBellCurveDistribution);
router.post("/appraisals", hasPermission("UPDATE_KRA_GOALS", "UPDATE_PERFORMANCE"), saveAppraisal);

// 4. Monthly Rating Routes
router.get("/ratings", hasPermission("VIEW_KRA_GOALS", "VIEW_PERFORMANCE"), getMonthlyRatings);
router.post("/ratings", hasPermission("UPDATE_KRA_GOALS", "CREATE_PERFORMANCE"), createMonthlyRating);

export default router;
