import type { NextFunction, Request, Response } from "express";
import { asyncHandler } from "../../../middlewares/error.middleware.ts";
import { statusCode } from "../../../types/types.ts";
import { SuccessResponse } from "../../../utils/response.util.ts";
import { AttendanceService } from "../services/attendance.service.ts";
import {
  applyRegularizationSchema,
  approveRejectRegularizationSchema,
  createGeofenceSchema,
  createPunchSchema,
  saveRosterSchema,
} from "../validators/attendance.validator.ts";

export const getPunches = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const employeeId = req.params.employeeId as string;
  const organizationId = (req as any).user?.organizationId;
  const requestingUser = (req as any).user;
  const punches = await AttendanceService.getPunches(employeeId, organizationId, requestingUser);
  return SuccessResponse(
    res,
    "Punches retrieved successfully",
    punches,
    statusCode.OK
  );
});

export const createPunch = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const parsed = createPunchSchema.safeParse(req.body);
  if (!parsed.success) {
    return next(parsed.error);
  }

  const organizationId = (req as any).user?.organizationId;
  const requestingUser = (req as any).user;
  const punch = await AttendanceService.createPunch(parsed.data, organizationId, requestingUser);
  return SuccessResponse(
    res,
    "Punch recorded successfully",
    punch,
    statusCode.Created
  );
});

export const getRegularizations = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const organizationId = (req as any).user?.organizationId;
  const regs = await AttendanceService.getRegularizations(organizationId);
  return SuccessResponse(
    res,
    "Regularizations retrieved successfully",
    regs,
    statusCode.OK
  );
});

export const applyRegularization = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const parsed = applyRegularizationSchema.safeParse(req.body);
  if (!parsed.success) {
    return next(parsed.error);
  }

  const organizationId = (req as any).user?.organizationId;
  const requestingUser = (req as any).user;
  const reg = await AttendanceService.applyRegularization(parsed.data, organizationId, requestingUser);
  return SuccessResponse(
    res,
    "Regularization applied successfully",
    reg,
    statusCode.Created
  );
});

export const updateRegularization = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const id = req.params.id as string;
  const parsed = approveRejectRegularizationSchema.safeParse(req.body);
  if (!parsed.success) {
    return next(parsed.error);
  }

  const organizationId = (req as any).user?.organizationId;
  const reg = await AttendanceService.updateRegularization(id, parsed.data.status, organizationId);
  return SuccessResponse(
    res,
    "Regularization status updated successfully",
    reg,
    statusCode.OK
  );
});

export const getGeofences = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const organizationId = (req as any).user?.organizationId;
  const geofences = await AttendanceService.getGeofences(organizationId);
  return SuccessResponse(
    res,
    "Geofences retrieved successfully",
    geofences,
    statusCode.OK
  );
});

export const createGeofence = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const parsed = createGeofenceSchema.safeParse(req.body);
  if (!parsed.success) {
    return next(parsed.error);
  }

  const organizationId = (req as any).user?.organizationId;
  const geofence = await AttendanceService.createGeofence(parsed.data, organizationId);
  return SuccessResponse(
    res,
    "Geofence location registered successfully",
    geofence,
    statusCode.Created
  );
});

export const deleteGeofence = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const id = req.params.id as string;
  const organizationId = (req as any).user?.organizationId;
  await AttendanceService.deleteGeofence(id, organizationId);
  return SuccessResponse(
    res,
    "Geofence location deleted successfully",
    null,
    statusCode.OK
  );
});

export const getRosters = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const week = (req.query.week as string) || "Week 27 (Jul 1 - Jul 5)";
  const organizationId = (req as any).user?.organizationId;
  const rosters = await AttendanceService.getRosters(week, organizationId);
  return SuccessResponse(
    res,
    "Shift rosters retrieved successfully",
    rosters,
    statusCode.OK
  );
});

export const saveRosters = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const parsed = saveRosterSchema.safeParse(req.body);
  if (!parsed.success) {
    return next(parsed.error);
  }

  const organizationId = (req as any).user?.organizationId;
  const rosters = await AttendanceService.saveRosters(parsed.data.week, parsed.data.rosters, organizationId);
  return SuccessResponse(
    res,
    "Weekly shift roster saved successfully",
    rosters,
    statusCode.OK
  );
});

export const getShiftTimings = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const organizationId = (req as any).user?.organizationId;
  const timings = await AttendanceService.getShiftTimings(organizationId);
  return SuccessResponse(
    res,
    "Shift timings retrieved successfully",
    timings,
    statusCode.OK
  );
});

export const createShiftTiming = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const organizationId = (req as any).user?.organizationId;
  const newTiming = await AttendanceService.createShiftTiming(req.body, organizationId);
  return SuccessResponse(
    res,
    "Shift timing created successfully",
    newTiming,
    statusCode.Created
  );
});

export const deleteShiftTiming = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const id = req.params.id as string;
  const organizationId = (req as any).user?.organizationId;
  await AttendanceService.deleteShiftTiming(id, organizationId);
  return SuccessResponse(
    res,
    "Shift timing deleted successfully",
    null,
    statusCode.OK
  );
});

export const getMusterRoll = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const organizationId = (req as any).user?.organizationId;
  const requestingUser = (req as any).user;
  const musterRoll = await AttendanceService.getMusterRoll(
    {
      month: req.query.month as string | undefined,
      year: req.query.year as string | undefined,
      employeeId: req.query.employeeId as string | undefined,
    },
    organizationId,
    requestingUser
  );
  return SuccessResponse(
    res,
    "Muster roll retrieved successfully",
    musterRoll,
    statusCode.OK
  );
});


