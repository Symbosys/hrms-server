import { z } from "zod";

export const companyClientSchema = z.object({
  name: z.string().min(1, "Company name is required"),
  industry: z.string().min(1, "Industry is required"),
  employeeCount: z.number().int().nonnegative().default(0),
  licenseTier: z.enum(["Enterprise", "Pro", "Starter"]).default("Starter"),
  status: z.enum(["Active", "Onboarding", "Suspended"]).default("Active"),
  contactEmail: z.string().email("Invalid contact email address"),
  onboardedDate: z.string().optional(),
  iconName: z.string().optional(),
  iconColor: z.string().optional(),
  iconBg: z.string().optional(),
  // Organization admin credentials for onboarding
  adminName: z.string().min(1, "Admin name is required").optional(),
  adminEmail: z.string().email("Invalid admin email").optional(),
  adminPhone: z.string().optional(),
  adminPassword: z.string().min(6, "Admin password must be at least 6 characters").optional(),
});

export type CompanyClientInput = z.infer<typeof companyClientSchema>;

export const resetCompanyCredentialsSchema = z.object({
  newEmail: z.string().email("Invalid email format").optional().or(z.literal("")),
  newPassword: z.string().min(6, "Password must be at least 6 characters long").optional(),
  // Aliases for frontend flexibility
  email: z.string().email("Invalid email format").optional().or(z.literal("")),
  password: z.string().min(6, "Password must be at least 6 characters long").optional(),
}).refine((data) => data.newPassword || data.password, {
  message: "Password is required and must be at least 6 characters long",
  path: ["newPassword"],
});

export type ResetCompanyCredentialsInput = z.infer<typeof resetCompanyCredentialsSchema>;
