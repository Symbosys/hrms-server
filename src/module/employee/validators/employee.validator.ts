import { z } from "zod";

const EmployeeStatusEnum = z.enum(["ACTIVE", "ON_LEAVE", "TERMINATED", "RESIGNED", "PROBATION"]);
const ConfirmationStatusEnum = z.enum(["PENDING", "CONFIRMED", "EXTENDED"]);

const dateSchema = z.preprocess(
  (val) => (typeof val === "string" && val ? new Date(val) : val),
  z.date({ message: "Invalid date format" })
);

const optionalDateSchema = z.preprocess(
  (val) => (typeof val === "string" && val ? new Date(val) : val),
  z.date().optional().nullable()
);

export const createEmployeeSchema = z
  .object({
    id: z.string().optional(),
    employeeId: z.string().optional(),
    name: z.string().optional(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    email: z
      .string({ message: "Email is required" })
      .email("Invalid email format"),
    phone: z.string().optional().nullable(),
    password: z.string().optional().nullable(),
    avatar: z.string().optional().nullable(),
    status: EmployeeStatusEnum.optional(),
    joiningDate: dateSchema,
    location: z.string().optional().nullable(),
    address: z.string().optional().nullable(),
    designation: z.string().optional().nullable(),
    
    // Relations
    userId: z.string().optional().nullable(),
    roleId: z.string().optional().nullable(),
    departmentId: z.string().optional().nullable(),
    department: z.string().optional().nullable(),
    managerId: z.string().optional().nullable(),

    // Salary Details
    basic: z.number().optional().nullable(),
    salary: z.number().optional().nullable(),
    hra: z.number().optional().nullable(),
    allowance: z.number().optional().nullable(),
    deductions: z.number().optional().nullable(),
    netSalary: z.number().optional().nullable(),
    bankName: z.string().optional().nullable(),
    bankAccount: z.string().optional().nullable(),
    ifsc: z.string().optional().nullable(),
    pan: z.string().optional().nullable(),
    aadhaar: z.string().optional().nullable(),
    uan: z.string().optional().nullable(),
    pfNumber: z.string().optional().nullable(),

    // Personal Details
    gender: z.string().optional().nullable(),
    dob: optionalDateSchema,
    dateOfBirth: optionalDateSchema,
    bloodGroup: z.string().optional().nullable(),
    maritalStatus: z.string().optional().nullable(),
    qualification: z.string().optional().nullable(),
    university: z.string().optional().nullable(),
    passingYear: z.string().optional().nullable(),
    fatherName: z.string().optional().nullable(),
    permanentAddress: z.string().optional().nullable(),
    languagesSpoken: z.string().optional().nullable(),

    // Workflows & Exit
    probationDuration: z.string().optional().nullable(),
    probationEnd: optionalDateSchema,
    confirmationStatus: ConfirmationStatusEnum.optional(),
    exitDate: optionalDateSchema,
    clearanceStatus: z.string().optional().nullable(),
  })
  .superRefine((data, ctx) => {
    const hasName = !!data.name || !!data.firstName || !!data.lastName;
    if (!hasName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Name is required",
        path: ["name"],
      });
    }
  })
  .transform((data) => {
    const name = data.name || [data.firstName, data.lastName].filter(Boolean).join(" ");
    const id = data.id || data.employeeId;
    const location = data.location || data.address;
    const basic = data.basic !== undefined && data.basic !== null ? data.basic : data.salary;
    const netSalary = data.netSalary !== undefined && data.netSalary !== null ? data.netSalary : basic;
    const dob = data.dob || data.dateOfBirth;

    // Destructure to remove incoming transient fields
    const { employeeId, firstName, lastName, address, salary, dateOfBirth, ...rest } = data;

    return {
      ...rest,
      id,
      name,
      location,
      basic,
      netSalary,
      dob,
    };
  });

export const updateEmployeeSchema = z
  .object({
    name: z.string().optional(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    email: z.string().email("Invalid email format").optional(),
    phone: z.string().optional().nullable(),
    password: z.string().optional().nullable(),
    avatar: z.string().optional().nullable(),
    status: EmployeeStatusEnum.optional(),
    joiningDate: optionalDateSchema,
    location: z.string().optional().nullable(),
    address: z.string().optional().nullable(),
    designation: z.string().optional().nullable(),
    role: z.string().optional().nullable(),
    
    // Relations
    userId: z.string().optional().nullable(),
    departmentId: z.string().optional().nullable(),
    department: z.string().optional().nullable(),
    managerId: z.string().optional().nullable(),

    // Salary Details
    basic: z.number().optional().nullable(),
    salary: z.number().optional().nullable(),
    hra: z.number().optional().nullable(),
    allowance: z.number().optional().nullable(),
    deductions: z.number().optional().nullable(),
    netSalary: z.number().optional().nullable(),
    bankName: z.string().optional().nullable(),
    bankAccount: z.string().optional().nullable(),
    ifsc: z.string().optional().nullable(),
    pan: z.string().optional().nullable(),
    aadhaar: z.string().optional().nullable(),
    uan: z.string().optional().nullable(),
    pfNumber: z.string().optional().nullable(),

    // Personal Details
    gender: z.string().optional().nullable(),
    dob: optionalDateSchema,
    dateOfBirth: optionalDateSchema,
    bloodGroup: z.string().optional().nullable(),
    maritalStatus: z.string().optional().nullable(),
    qualification: z.string().optional().nullable(),
    university: z.string().optional().nullable(),
    passingYear: z.string().optional().nullable(),
    fatherName: z.string().optional().nullable(),
    permanentAddress: z.string().optional().nullable(),
    languagesSpoken: z.string().optional().nullable(),

    // Workflows & Exit
    probationDuration: z.string().optional().nullable(),
    probationEnd: optionalDateSchema,
    confirmationStatus: ConfirmationStatusEnum.optional(),
    exitDate: optionalDateSchema,
    clearanceStatus: z.string().optional().nullable(),
  })
  .transform((data) => {
    let name = data.name;
    if (!name && (data.firstName || data.lastName)) {
      name = [data.firstName, data.lastName].filter(Boolean).join(" ");
    }
    const location = data.location || data.address;
    const designation = data.designation !== undefined ? data.designation : data.role;
    const basic = data.basic !== undefined && data.basic !== null ? data.basic : data.salary;
    const netSalary = data.netSalary !== undefined && data.netSalary !== null ? data.netSalary : basic;
    const dob = data.dob || data.dateOfBirth;

    const { firstName, lastName, address, salary, dateOfBirth, role, ...rest } = data;

    return {
      ...rest,
      ...(name ? { name } : {}),
      ...(location ? { location } : {}),
      ...(designation !== undefined ? { designation } : {}),
      ...(basic !== undefined ? { basic } : {}),
      ...(netSalary !== undefined ? { netSalary } : {}),
      ...(dob ? { dob } : {}),
    };
  });

export const updateSalarySchema = z
  .object({
    basic: z.number().optional().nullable(),
    salary: z.number().optional().nullable(),
    hra: z.number().optional().nullable(),
    allowance: z.number().optional().nullable(),
    deductions: z.number().optional().nullable(),
    netSalary: z.number().optional().nullable(),
    bankName: z.string().optional().nullable(),
    bankAccount: z.string().optional().nullable(),
    ifsc: z.string().optional().nullable(),
    pan: z.string().optional().nullable(),
    aadhaar: z.string().optional().nullable(),
    uan: z.string().optional().nullable(),
    pfNumber: z.string().optional().nullable(),
  })
  .transform((data) => {
    const basic = data.basic !== undefined && data.basic !== null ? data.basic : data.salary;
    const netSalary = data.netSalary !== undefined && data.netSalary !== null ? data.netSalary : basic;
    const { salary, ...rest } = data;
    return {
      ...rest,
      ...(basic !== undefined ? { basic } : {}),
      ...(netSalary !== undefined ? { netSalary } : {}),
    };
  });

export const updatePersonalSchema = z
  .object({
    gender: z.string().optional().nullable(),
    dob: optionalDateSchema,
    dateOfBirth: optionalDateSchema,
    bloodGroup: z.string().optional().nullable(),
    maritalStatus: z.string().optional().nullable(),
    qualification: z.string().optional().nullable(),
    university: z.string().optional().nullable(),
    passingYear: z.string().optional().nullable(),
    fatherName: z.string().optional().nullable(),
    permanentAddress: z.string().optional().nullable(),
    languagesSpoken: z.string().optional().nullable(),
  })
  .transform((data) => {
    const dob = data.dob || data.dateOfBirth;
    const { dateOfBirth, ...rest } = data;
    return {
      ...rest,
      ...(dob ? { dob } : {}),
    };
  });

export const addFamilyMemberSchema = z.object({
  name: z.string({ message: "Family member full name is required" }).min(1),
  relation: z.string({ message: "Relationship type is required" }).min(1),
  dob: z.string().optional().nullable(),
  contact: z.string().optional().nullable(),
  bloodGroup: z.string().optional().nullable(),
  isNominee: z.boolean().optional().default(false),
  isInsuranceCovered: z.boolean().optional().default(false),
});

export const saveEmployeeExitSchema = z.object({
  resignationDate: dateSchema,
  lastWorkingDay: dateSchema,
  reason: z.string().optional().nullable(),
  noticeDays: z.number().optional().default(30),
  leaveEncashDays: z.number().optional().default(0),
  penaltyDeduction: z.number().optional().default(0),
  itClearance: z.boolean().optional().default(false),
  financeClearance: z.boolean().optional().default(false),
  adminClearance: z.boolean().optional().default(false),
  hrClearance: z.boolean().optional().default(false),
  status: z.string().optional().default("PENDING_CLEARANCE"),
  settledDate: optionalDateSchema,
  netPayable: z.number().optional().nullable(),
});

export const resetEmployeeCredentialsSchema = z.object({
  newEmail: z.string().email("Invalid email format").optional().nullable(),
  newPassword: z.string().min(6, "Password must be at least 6 characters").optional().nullable(),
  email: z.string().email("Invalid email format").optional().nullable(),
  password: z.string().min(6, "Password must be at least 6 characters").optional().nullable(),
});

export type ResetEmployeeCredentialsInput = z.infer<typeof resetEmployeeCredentialsSchema>;
