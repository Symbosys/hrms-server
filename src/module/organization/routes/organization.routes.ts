import { Router } from "express";
import { protect, hasPermission } from "../../../middlewares/auth.middleware.ts";
import {
  createOrganization,
  deleteOrganization,
  getOrganization,
  listOrganizations,
  updateOrganization,
} from "../controllers/organization.controller.ts";
import {
  addMember,
  getMembership,
  listMembers,
  listMyOrganizations,
  removeMember,
  updateMembership,
} from "../controllers/membership.controller.ts";
import {
  resetCompanyCredentials,
  getCompanyCredentials,
} from "../../platform/companiesdirectory/controllers/companyDirectory.controller.ts";

const router = Router();

// ─── Public Routes ──────────────────────────────────────────────────────────
// Public onboarding route to create an organization
router.post("/", createOrganization);

// ─── Protected Routes ────────────────────────────────────────────────────────
// All routes below require authentication
router.use(protect);

// GET /api/v1/organizations/me  → must come BEFORE /:id so "me" is not treated as an ID
router.get("/me", listMyOrganizations);

router.get("/", listOrganizations);

// Platform Admin can reset credentials or view current admin credentials for an organization
router.get("/:id/credentials", getCompanyCredentials);
router.post("/:id/reset-credentials", resetCompanyCredentials);

router
  .route("/:id")
  .get(getOrganization)
  .patch(hasPermission("UPDATE_EMPLOYEE_MASTER", "UPDATE_ADMIN"), updateOrganization)
  .delete(hasPermission("DELETE_ADMIN"), deleteOrganization);

// ─── Membership Management ──────────────────────────────────────────────────
router
  .route("/:orgId/members")
  .get(hasPermission("VIEW_EMPLOYEE_DIRECTORY", "VIEW_EMPLOYEES"), listMembers)
  .post(hasPermission("UPDATE_EMPLOYEE_MASTER", "CREATE_EMPLOYEES"), addMember);

router
  .route("/:orgId/members/:userId")
  .get(hasPermission("VIEW_EMPLOYEE_MASTER", "VIEW_EMPLOYEES"), getMembership)
  .patch(hasPermission("UPDATE_EMPLOYEE_MASTER", "UPDATE_EMPLOYEES"), updateMembership)
  .delete(hasPermission("UPDATE_EMPLOYEE_MASTER", "DELETE_EMPLOYEES"), removeMember);

export default router;
