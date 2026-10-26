import type { Request, Response, NextFunction } from "express";
import { asyncHandler } from "../../../../middlewares/error.middleware.ts";
import { statusCode } from "../../../../types/types.ts";
import { SuccessResponse } from "../../../../utils/response.util.ts";
import { CompanyDirectoryService } from "../services/companyDirectory.service.ts";
import {
  companyClientSchema,
  resetCompanyCredentialsSchema,
} from "../validators/companyDirectory.validator.ts";

/**
 * @desc    List all client companies (with optional search and status filters)
 * @route   GET /api/v1/platform/companies
 * @access  Private
 */
export const listCompanies = asyncHandler(async (req: Request, res: Response) => {
  const search = req.query.search as string | undefined;
  const status = req.query.status as string | undefined;

  const companies = await CompanyDirectoryService.getCompanies(search, status);
  return SuccessResponse(
    res,
    "Companies retrieved successfully",
    companies,
    statusCode.OK
  );
});

/**
 * @desc    Get client company by ID
 * @route   GET /api/v1/platform/companies/:id
 * @access  Private
 */
export const getCompany = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const company = await CompanyDirectoryService.getCompanyById(id);
  return SuccessResponse(
    res,
    "Company details retrieved successfully",
    company,
    statusCode.OK
  );
});

/**
 * @desc    Create a new client company
 * @route   POST /api/v1/platform/companies
 * @access  Private
 */
export const createCompany = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const parsed = companyClientSchema.safeParse(req.body);
  if (!parsed.success) {
    return next(parsed.error);
  }

  const company = await CompanyDirectoryService.createCompany(parsed.data);
  return SuccessResponse(
    res,
    "Client company created successfully",
    company,
    statusCode.Created
  );
});

/**
 * @desc    Update a client company
 * @route   PATCH /api/v1/platform/companies/:id
 * @access  Private
 */
export const updateCompany = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const id = req.params.id as string;
  const company = await CompanyDirectoryService.updateCompany(id, req.body);
  return SuccessResponse(
    res,
    "Client company updated successfully",
    company,
    statusCode.OK
  );
});

/**
 * @desc    Delete a client company
 * @route   DELETE /api/v1/platform/companies/:id
 * @access  Private
 */
export const deleteCompany = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const result = await CompanyDirectoryService.deleteCompany(id);
  return SuccessResponse(
    res,
    "Client company deleted successfully",
    result,
    statusCode.OK
  );
});

/**
 * @desc    Reset organization admin credentials (email & password)
 * @route   POST /api/v1/platform/companies/:id/reset-credentials
 * @access  Private (Platform Admin)
 */
export const resetCompanyCredentials = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const id = req.params.id as string;
    const parsed = resetCompanyCredentialsSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(parsed.error);
    }

    const result = await CompanyDirectoryService.resetCredentials(id, parsed.data);
    return SuccessResponse(
      res,
      "Organization admin credentials reset successfully",
      result,
      statusCode.OK
    );
  }
);

/**
 * @desc    Get current organization admin credentials summary
 * @route   GET /api/v1/platform/companies/:id/credentials
 * @access  Private (Platform Admin)
 */
export const getCompanyCredentials = asyncHandler(
  async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const result = await CompanyDirectoryService.getCredentials(id);
    return SuccessResponse(
      res,
      "Organization admin credentials retrieved successfully",
      result,
      statusCode.OK
    );
  }
);
