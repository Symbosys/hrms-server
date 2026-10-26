import { Router } from "express";
import {
  listCompanies,
  getCompany,
  createCompany,
  updateCompany,
  deleteCompany,
  resetCompanyCredentials,
  getCompanyCredentials,
} from "../controllers/companyDirectory.controller.ts";
import { protect } from "../../../../middlewares/auth.middleware.ts";

const router = Router();

router.use(protect);

router.get("/companies", listCompanies);
router.get("/companies/:id", getCompany);
router.post("/companies", createCompany);
router.patch("/companies/:id", updateCompany);
router.delete("/companies/:id", deleteCompany);

// Credentials Management (Platform Admin can reset organization admin credentials)
router.get("/companies/:id/credentials", getCompanyCredentials);
router.post("/companies/:id/reset-credentials", resetCompanyCredentials);

// Also add organization route aliases under /platform for flexibility
router.get("/organizations/:id/credentials", getCompanyCredentials);
router.post("/organizations/:id/reset-credentials", resetCompanyCredentials);

export default router;
