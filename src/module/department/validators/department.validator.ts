import { z } from "zod";

export const createDepartmentSchema = z.object({
  name: z
    .string({ message: "Department name is required" })
    .min(2, "Department name must be at least 2 characters")
    .max(100, "Department name must not exceed 100 characters"),
  code: z
    .string()
    .min(2, "Department code must be at least 2 characters")
    .max(20, "Department code must not exceed 20 characters")
    .toUpperCase()
    .optional(),
  description: z.string().optional().nullable(),
  managerId: z.string().nullable().optional(),
  parentId: z.string().nullable().optional(),
});

export const updateDepartmentSchema = z.object({
  name: z
    .string()
    .min(2, "Department name must be at least 2 characters")
    .max(100, "Department name must not exceed 100 characters")
    .optional(),
  code: z
    .string()
    .min(2, "Department code must be at least 2 characters")
    .max(20, "Department code must not exceed 20 characters")
    .toUpperCase()
    .optional(),
  description: z.string().optional(),
  managerId: z.string().nullable().optional(),
  parentId: z.string().nullable().optional(),
});
