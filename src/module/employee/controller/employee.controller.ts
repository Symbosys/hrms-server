import type { NextFunction, Request, Response } from "express";
import type { AuthenticatedRequest } from "../../../middlewares/auth.middleware.ts";
import { asyncHandler } from "../../../middlewares/error.middleware.ts";
import { statusCode } from "../../../types/types.ts";
import { ErrorResponse, SuccessResponse } from "../../../utils/response.util.ts";
import { EmployeeService } from "../services/employee.service.ts";
import {
  addFamilyMemberSchema,
  createEmployeeSchema,
  resetEmployeeCredentialsSchema,
  saveEmployeeExitSchema,
  updateEmployeeSchema,
  updatePersonalSchema,
  updateSalarySchema,
} from "../validators/employee.validator.ts";

export const createEmployee = asyncHandler(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const parsed = createEmployeeSchema.safeParse(req.body);
  if (!parsed.success) {
    return next(parsed.error);
  }

  const employee = await EmployeeService.createEmployee(parsed.data, req.user?.organizationId);

  return SuccessResponse(
    res,
    "Employee record created successfully",
    employee,
    statusCode.Created
  );
});

export const getEmployees = asyncHandler(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const { departmentId, managerId, status, search } = req.query;

  const employees = await EmployeeService.getEmployees({
    organizationId: req.user?.organizationId,
    departmentId: departmentId as string,
    managerId: managerId as string,
    status: status as any,
    search: search as string,
  });

  return SuccessResponse(
    res,
    "Employees retrieved successfully",
    employees,
    statusCode.OK
  );
});

export const getEmployeeById = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const id = req.params.id as string;
  const employee = await EmployeeService.getEmployeeById(id);

  if (!employee) {
    return SuccessResponse(
      res,
      "Employee not found",
      null,
      statusCode.OK
    );
  }

  return SuccessResponse(
    res,
    "Employee retrieved successfully",
    employee,
    statusCode.OK
  );
});


export const updateEmployee = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const id = req.params.id as string;
  const parsed = updateEmployeeSchema.safeParse(req.body);
  if (!parsed.success) {
    return next(parsed.error);
  }

  const updatedEmployee = await EmployeeService.updateEmployee(id, parsed.data);

  return SuccessResponse(
    res,
    "Employee updated successfully",
    updatedEmployee,
    statusCode.OK
  );
});

export const deleteEmployee = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const id = req.params.id as string;
  await EmployeeService.deleteEmployee(id);

  return SuccessResponse(
    res,
    "Employee deleted successfully",
    {},
    statusCode.OK
  );
});

// Helper to check if the requesting user has access to this employee profile
const checkEmployeeAccess = async (req: any, employeeId: string) => {
  const employee = await EmployeeService.getEmployeeById(employeeId);
  if (!employee) {
    return null;
  }
  const isSelf = req.user.id === employee.userId;
  const isAdmin = req.user.role && ["SUPER_ADMIN", "HR_ADMIN"].includes(req.user.role.name);
  if (!isSelf && !isAdmin) {
    throw new ErrorResponse("You do not have permission to access this resource", statusCode.Forbidden);
  }
  return employee;
};

export const getEmployeeSalary = asyncHandler(async (req: any, res: Response, next: NextFunction) => {
  const id = req.params.id as string;
  
  // Ensure access
  const employee = await checkEmployeeAccess(req, id);
  if (!employee) {
    return SuccessResponse(
      res,
      "Employee not found",
      null,
      statusCode.OK
    );
  }

  const salaryDetails = await EmployeeService.getEmployeeSalary(id);

  return SuccessResponse(
    res,
    "Employee salary details retrieved successfully",
    salaryDetails,
    statusCode.OK
  );
});

export const updateEmployeeSalary = asyncHandler(async (req: any, res: Response, next: NextFunction) => {
  const id = req.params.id as string;

  // Only SUPER_ADMIN and HR_ADMIN are allowed to update salary details
  const isAdmin = req.user.role && ["SUPER_ADMIN", "HR_ADMIN"].includes(req.user.role.name);
  if (!isAdmin) {
    return next(new ErrorResponse("You do not have permission to perform this action", statusCode.Forbidden));
  }

  const parsed = updateSalarySchema.safeParse(req.body);
  if (!parsed.success) {
    return next(parsed.error);
  }

  const updatedEmployee = await EmployeeService.updateEmployeeSalary(id, parsed.data);

  return SuccessResponse(
    res,
    "Employee salary details updated successfully",
    updatedEmployee,
    statusCode.OK
  );
});

export const getEmployeePersonal = asyncHandler(async (req: any, res: Response, next: NextFunction) => {
  const id = req.params.id as string;

  // Ensure access
  const employee = await checkEmployeeAccess(req, id);
  if (!employee) {
    return SuccessResponse(
      res,
      "Employee not found",
      null,
      statusCode.OK
    );
  }

  const personalDetails = await EmployeeService.getEmployeePersonal(id);

  return SuccessResponse(
    res,
    "Employee personal details retrieved successfully",
    personalDetails,
    statusCode.OK
  );
});

export const updateEmployeePersonal = asyncHandler(async (req: any, res: Response, next: NextFunction) => {
  const id = req.params.id as string;

  // Ensure access (employee can update their own personal details or admin can)
  const employee = await checkEmployeeAccess(req, id);
  if (!employee) {
    return next(new ErrorResponse("Employee not found", statusCode.Not_Found));
  }

  const parsed = updatePersonalSchema.safeParse(req.body);
  if (!parsed.success) {
    return next(parsed.error);
  }

  const updatedEmployee = await EmployeeService.updateEmployeePersonal(id, parsed.data);

  return SuccessResponse(
    res,
    "Employee personal details updated successfully",
    updatedEmployee,
    statusCode.OK
  );
});

// Family Members & Dependents
export const getEmployeeFamily = asyncHandler(async (req: any, res: Response, next: NextFunction) => {
  const id = req.params.id as string;
  const employee = await checkEmployeeAccess(req, id);
  if (!employee) {
    return SuccessResponse(
      res,
      "Employee not found",
      [],
      statusCode.OK
    );
  }
  const familyMembers = await EmployeeService.getEmployeeFamily(id);

  return SuccessResponse(
    res,
    "Employee family details retrieved successfully",
    familyMembers,
    statusCode.OK
  );
});

export const addEmployeeFamilyMember = asyncHandler(async (req: any, res: Response, next: NextFunction) => {
  const id = req.params.id as string;
  const employee = await checkEmployeeAccess(req, id);
  if (!employee) {
    return next(new ErrorResponse("Employee not found", statusCode.Not_Found));
  }

  const parsed = addFamilyMemberSchema.safeParse(req.body);
  if (!parsed.success) {
    return next(parsed.error);
  }

  const member = await EmployeeService.addEmployeeFamilyMember(id, parsed.data);

  return SuccessResponse(
    res,
    "Family member added successfully",
    member,
    statusCode.Created
  );
});

export const removeEmployeeFamilyMember = asyncHandler(async (req: any, res: Response, next: NextFunction) => {
  const familyId = req.params.familyId as string;
  await EmployeeService.removeEmployeeFamilyMember(familyId);

  return SuccessResponse(
    res,
    "Family member deleted successfully",
    {},
    statusCode.OK
  );
});

// Exit Management & F&F Settlement
export const getEmployeeExit = asyncHandler(async (req: any, res: Response, next: NextFunction) => {
  const id = req.params.id as string;
  const employee = await checkEmployeeAccess(req, id);
  if (!employee) {
    return SuccessResponse(
      res,
      "Employee not found",
      null,
      statusCode.OK
    );
  }
  const exitRecord = await EmployeeService.getEmployeeExit(id);

  return SuccessResponse(
    res,
    "Employee exit record retrieved successfully",
    exitRecord,
    statusCode.OK
  );
});

export const saveEmployeeExit = asyncHandler(async (req: any, res: Response, next: NextFunction) => {
  const id = req.params.id as string;
  const employee = await checkEmployeeAccess(req, id);
  if (!employee) {
    return next(new ErrorResponse("Employee not found", statusCode.Not_Found));
  }

  const parsed = saveEmployeeExitSchema.safeParse(req.body);
  if (!parsed.success) {
    return next(parsed.error);
  }

  const exitRecord = await EmployeeService.upsertEmployeeExit(id, parsed.data);

  return SuccessResponse(
    res,
    "Employee exit record saved successfully",
    exitRecord,
    statusCode.OK
  );
});

/**
 * @desc    Reset employee email and/or password (by Org Admin or HR)
 * @route   POST /api/v1/employees/:id/reset-credentials
 * @access  Protected
 */
export const resetEmployeeCredentials = asyncHandler(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const id = req.params.id as string;
  if (!id) {
    return next(new ErrorResponse("Employee ID is required", statusCode.Bad_Request));
  }

  const parsed = resetEmployeeCredentialsSchema.safeParse(req.body);
  if (!parsed.success) {
    return next(parsed.error);
  }

  const result = await EmployeeService.resetEmployeeCredentials(id, parsed.data, req.user);

  return SuccessResponse(
    res,
    "Employee login credentials reset successfully",
    result,
    statusCode.OK
  );
});

/**
 * @desc    Get employee credentials metadata
 * @route   GET /api/v1/employees/:id/credentials
 * @access  Protected
 */
export const getEmployeeCredentials = asyncHandler(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const id = req.params.id as string;
  if (!id) {
    return next(new ErrorResponse("Employee ID is required", statusCode.Bad_Request));
  }

  const result = await EmployeeService.getEmployeeCredentials(id, req.user);

  return SuccessResponse(
    res,
    "Employee credentials retrieved successfully",
    result,
    statusCode.OK
  );
});

