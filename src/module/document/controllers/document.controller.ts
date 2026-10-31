import type { NextFunction, Response } from "express";
import { prisma } from "../../../db/prisma.ts";
import type { AuthenticatedRequest } from "../../../middlewares/auth.middleware.ts";
import { asyncHandler } from "../../../middlewares/error.middleware.ts";
import { statusCode } from "../../../types/types.ts";
import { uploadBufferToCloudinary, uploadDataUriToCloudinary } from "../../../utils/cloudinary.util.ts";
import { ErrorResponse, SuccessResponse } from "../../../utils/response.util.ts";
import { DocumentService } from "../services/document.service.ts";
import { uploadDocumentSchema } from "../validators/document.validator.ts";

export const getDocuments = asyncHandler(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const employeeId = req.query.employeeId as string | undefined;
  const category = req.query.category as string | undefined;

  const docs = await DocumentService.getDocuments({
    employeeId,
    category,
    organizationId: req.user?.organizationId,
  });

  return SuccessResponse(
    res,
    "Documents retrieved successfully",
    docs,
    statusCode.OK
  );
});

export const uploadDocument = asyncHandler(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const parsed = uploadDocumentSchema.safeParse(req.body);
  if (!parsed.success) {
    return next(parsed.error);
  }

  const doc = await DocumentService.uploadDocument(parsed.data, req.user?.organizationId);

  return SuccessResponse(
    res,
    "Document uploaded successfully",
    doc,
    statusCode.Created
  );
});

export const uploadAvatar = asyncHandler(async (req: any, res: Response, next: NextFunction) => {
  let result;
  if (req.file) {
    result = await uploadBufferToCloudinary(req.file.buffer, "avatars");
  } else if (req.body?.image) {
    result = await uploadDataUriToCloudinary(req.body.image, "avatars");
  } else {
    throw new ErrorResponse("No file or image payload provided", statusCode.Bad_Request);
  }

  const avatarUrl = result.secure_url || result.url;

  // Only persist avatar URL into logged-in Employee record if explicitly requested (e.g. self-profile update from Navbar)
  const shouldUpdateSelf =
    req.query?.updateSelf === "true" ||
    req.body?.updateSelf === "true" ||
    req.body?.updateSelf === true;

  if (shouldUpdateSelf && req.user) {
    try {
      const conditions: any[] = [];
      if (req.user.id) conditions.push({ userId: req.user.id });
      if (req.user.email) conditions.push({ email: req.user.email });
      if (req.user.phone) conditions.push({ phone: req.user.phone });

      if (conditions.length > 0) {
        await prisma.employee.updateMany({
          where: { OR: conditions },
          data: { avatar: avatarUrl }
        });
      }
    } catch (err) {
      console.error("[UploadAvatar] Failed to update employee avatar in DB:", err);
    }
  }

  return SuccessResponse(
    res,
    "Avatar uploaded successfully to Cloudinary",
    { url: avatarUrl, public_id: result.public_id },
    statusCode.OK
  );
});

export const deleteDocument = asyncHandler(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const id = req.params.id as string;
  await DocumentService.deleteDocument(id, req.user?.organizationId);

  return SuccessResponse(
    res,
    "Document deleted successfully",
    null,
    statusCode.OK
  );
});
