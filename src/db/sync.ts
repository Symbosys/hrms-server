import { SubscriptionRepository } from "../module/subscription/repo/subscription.repo.ts";
import { seedPermissions } from "../seed/permission.seed.ts";
import { prisma } from "./prisma.ts";

/**
 * Automatically creates the users table and indexes if they do not exist
 */
export async function syncDatabase() {
  try {
    console.log("[DB Sync] Synchronizing database tables...");

    // 1. Create permissions table and unique index
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "permissions" (
        "id" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "description" TEXT,
        "module" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "permissions_name_key" ON "permissions"("name");
    `);

    // Create platform_companies table
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "platform_companies" (
        "id" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "industry" TEXT NOT NULL,
        "employeeCount" INTEGER NOT NULL DEFAULT 0,
        "licenseTier" TEXT NOT NULL DEFAULT 'Starter',
        "status" TEXT NOT NULL DEFAULT 'Active',
        "contactEmail" TEXT NOT NULL,
        "onboardedDate" TEXT NOT NULL,
        "iconName" TEXT DEFAULT 'LightningIcon',
        "iconColor" TEXT DEFAULT '#4f46e5',
        "iconBg" TEXT DEFAULT '#ede9fe',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "platform_companies_pkey" PRIMARY KEY ("id")
      );
    `);

    // Create subscription tables
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "subscription_plans" (
        "id" TEXT NOT NULL,
        "code" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "tagline" TEXT,
        "icon" TEXT DEFAULT 'Send',
        "iconBg" TEXT,
        "price" DOUBLE PRECISION NOT NULL,
        "billing" TEXT NOT NULL DEFAULT 'Billed annually',
        "btnText" TEXT NOT NULL DEFAULT 'Get Started',
        "btnStyle" TEXT,
        "checkColor" TEXT,
        "popular" BOOLEAN NOT NULL DEFAULT false,
        "features" TEXT[] DEFAULT ARRAY[]::TEXT[],
        "maxEmployees" INTEGER NOT NULL DEFAULT 25,
        "status" TEXT NOT NULL DEFAULT 'ACTIVE',
        "sortOrder" INTEGER NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "subscription_plans_code_key" ON "subscription_plans"("code");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "organization_subscriptions" (
        "id" TEXT NOT NULL,
        "organizationId" TEXT NOT NULL,
        "planId" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'ACTIVE',
        "billingCycle" TEXT NOT NULL DEFAULT 'ANNUAL',
        "pricePaid" DOUBLE PRECISION NOT NULL,
        "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "endDate" TIMESTAMP(3),
        "autoRenew" BOOLEAN NOT NULL DEFAULT true,
        "paymentStatus" TEXT NOT NULL DEFAULT 'PAID',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "organization_subscriptions_pkey" PRIMARY KEY ("id")
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "subscription_feature_comparisons" (
        "id" TEXT NOT NULL,
        "label" TEXT NOT NULL,
        "basic" TEXT NOT NULL,
        "pro" TEXT NOT NULL,
        "ent" TEXT NOT NULL,
        "sortOrder" INTEGER NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "subscription_feature_comparisons_pkey" PRIMARY KEY ("id")
      );
    `);
    // 2. Create roles table and unique index (scoped per organization)
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "roles" (
        "id" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "description" TEXT,
        "isSystem" BOOLEAN NOT NULL DEFAULT false,
        "organizationId" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
      );
    `);
    
    // Safely add organizationId column if table already exists
    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE "roles" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;`);
    } catch (colErr: any) {}

    // Drop legacy single-column unique constraint on role name so different organizations can use the same role names
    try {
      await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "roles_name_key";`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "roles" DROP CONSTRAINT IF EXISTS "roles_name_key";`);
    } catch (dropErr: any) {}

    // Create compound unique index on (name, organizationId)
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "roles_name_organizationId_key" ON "roles"("name", "organizationId");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "roles_organizationId_idx" ON "roles"("organizationId");
    `);

    // 3. Create implicit many-to-many join table (_PermissionToRole) and indices
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "_PermissionToRole" (
        "A" TEXT NOT NULL,
        "B" TEXT NOT NULL
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "_PermissionToRole_AB_unique" ON "_PermissionToRole"("A", "B");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "_PermissionToRole_B_index" ON "_PermissionToRole"("B");
    `);

    // 3.5. Create departments table and indices (scoped per organization)
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "departments" (
        "id" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "code" TEXT NOT NULL,
        "description" TEXT,
        "managerId" TEXT,
        "parentId" TEXT,
        "organizationId" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
      );
    `);

    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE "departments" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;`);
    } catch (colErr: any) {}

    try {
      await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "departments_name_key";`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "departments" DROP CONSTRAINT IF EXISTS "departments_name_key";`);
      await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "departments_code_key";`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "departments" DROP CONSTRAINT IF EXISTS "departments_code_key";`);
    } catch (dropErr: any) {}

    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "departments_name_organizationId_key" ON "departments"("name", "organizationId");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "departments_code_organizationId_key" ON "departments"("code", "organizationId");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "departments_organizationId_idx" ON "departments"("organizationId");
    `);

    // 4. Handle "users" table creation/alteration
    try {
      await prisma.$queryRawUnsafe(`SELECT 1 FROM "users" LIMIT 1`);
      console.log("[DB Sync] Table 'users' already exists.");
      try {
        await prisma.$executeRawUnsafe(`ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;`);
        console.log("[DB Sync] Successfully dropped NOT NULL constraint on email column.");
      } catch (alterError: any) {
        // Ignore errors if the database state is already correct
      }
    } catch (error: any) {
      console.log("[DB Sync] Table 'users' does not exist. Creating table...");
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "users" (
          "id" TEXT NOT NULL,
          "name" TEXT,
          "email" TEXT,
          "phone" TEXT,
          "password" TEXT,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL,
          CONSTRAINT "users_pkey" PRIMARY KEY ("id")
        );
      `);
      await prisma.$executeRawUnsafe(`
        CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key" ON "users"("email");
      `);
      await prisma.$executeRawUnsafe(`
        CREATE UNIQUE INDEX IF NOT EXISTS "users_phone_key" ON "users"("phone");
      `);
      console.log("[DB Sync] Table 'users' and unique indexes created successfully!");
    }

    // 4.5. Create platform_admins table
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "platform_admins" (
        "id" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "email" TEXT NOT NULL,
        "password" TEXT NOT NULL,
        "role" TEXT NOT NULL DEFAULT 'PLATFORM_ADMIN',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "platform_admins_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "platform_admins_email_key" ON "platform_admins"("email");
    `);

    // 5. Add "roleId" column to "users" safely (handling both lowercase and camelCase scenarios)
    const userRoleColumnCheck = await prisma.$queryRawUnsafe<any[]>(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'roleId'
    `);
    if (userRoleColumnCheck.length === 0) {
      const userRoleLowercaseCheck = await prisma.$queryRawUnsafe<any[]>(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'roleid'
      `);
      if (userRoleLowercaseCheck.length > 0) {
        await prisma.$executeRawUnsafe(`ALTER TABLE "users" RENAME COLUMN "roleid" TO "roleId";`);
        console.log("[DB Sync] Renamed 'roleid' to 'roleId' in 'users' table.");
      } else {
        await prisma.$executeRawUnsafe(`ALTER TABLE "users" ADD COLUMN "roleId" TEXT;`);
        console.log("[DB Sync] Added 'roleId' column to 'users' table.");
      }
    }

    // 5.5. Create employees table and indices
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "employees" (
        "id" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "email" TEXT NOT NULL,
        "phone" TEXT,
        "password" TEXT,
        "avatar" TEXT,
        "status" TEXT NOT NULL DEFAULT 'PROBATION',
        "joiningDate" TIMESTAMP(3) NOT NULL,
        "location" TEXT,
        "designation" TEXT,
        "userId" TEXT,
        "departmentId" TEXT,
        "managerId" TEXT,
        
        -- Salary details
        "basic" DOUBLE PRECISION,
        "hra" DOUBLE PRECISION,
        "allowance" DOUBLE PRECISION,
        "deductions" DOUBLE PRECISION,
        "netSalary" DOUBLE PRECISION,
        "bankName" TEXT,
        "bankAccount" TEXT,
        "ifsc" TEXT,
        "pan" TEXT,
        "aadhaar" TEXT,
        "uan" TEXT,
        "pfNumber" TEXT,

        -- Personal Details
        "gender" TEXT,
        "dob" TIMESTAMP(3),
        "bloodGroup" TEXT,
        "maritalStatus" TEXT,
        "qualification" TEXT,
        "university" TEXT,
        "passingYear" TEXT,

        -- Workflows & Exit
        "probationDuration" TEXT,
        "probationEnd" TIMESTAMP(3),
        "confirmationStatus" TEXT NOT NULL DEFAULT 'PENDING',
        "exitDate" TIMESTAMP(3),
        "clearanceStatus" TEXT,

        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
      );
    `);
    
    // Add missing columns safely if employees table already exists
    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "password" TEXT;`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "fatherName" TEXT;`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "permanentAddress" TEXT;`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "languagesSpoken" TEXT;`);
    } catch (colErr: any) {
      // Ignore error if columns already exist
    }

    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "employees_email_key" ON "employees"("email");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "employees_userId_key" ON "employees"("userId");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "employees_managerId_idx" ON "employees"("managerId");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "employees_departmentId_idx" ON "employees"("departmentId");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "employees_status_idx" ON "employees"("status");
    `);

    // Create custom ENUM types in PostgreSQL safely if they do not exist
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LeaveStatus') THEN
          CREATE TYPE "LeaveStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'HalfDaySession') THEN
          CREATE TYPE "HalfDaySession" AS ENUM ('FIRST_HALF', 'SECOND_HALF');
        END IF;
      END $$;
    `);

    // Drop leave_requests if the columns are text-based to rebuild them cleanly with the proper enums
    await prisma.$executeRawUnsafe(`
      DO $$
      DECLARE
        col_type text;
      BEGIN
        SELECT data_type INTO col_type 
        FROM information_schema.columns 
        WHERE table_name = 'leave_requests' AND column_name = 'status';
        
        IF col_type = 'character varying' OR col_type = 'text' THEN
          DROP TABLE IF EXISTS "leave_requests" CASCADE;
        END IF;
      END $$;
    `);

    // 5.6. Create leave_types table and indices
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "leave_types" (
        "id" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "code" TEXT NOT NULL,
        "description" TEXT,
        "defaultDays" DOUBLE PRECISION NOT NULL,
        "carryForward" BOOLEAN NOT NULL DEFAULT false,
        "maxCarryForward" DOUBLE PRECISION DEFAULT 0,
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "leave_types_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "leave_types_name_key" ON "leave_types"("name");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "leave_types_code_key" ON "leave_types"("code");
    `);

    // 5.7. Create leave_allocations table and indices
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "leave_allocations" (
        "id" TEXT NOT NULL,
        "employeeId" TEXT NOT NULL,
        "leaveTypeId" TEXT NOT NULL,
        "year" INTEGER NOT NULL,
        "allocated" DOUBLE PRECISION NOT NULL,
        "used" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "pending" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "carriedForward" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "leave_allocations_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "leave_allocations_employeeId_leaveTypeId_year_key" ON "leave_allocations"("employeeId", "leaveTypeId", "year");
    `);

    // 5.8. Create leave_requests table and indices using custom enums
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "leave_requests" (
        "id" TEXT NOT NULL,
        "employeeId" TEXT NOT NULL,
        "leaveTypeId" TEXT NOT NULL,
        "startDate" TIMESTAMP(3) NOT NULL,
        "endDate" TIMESTAMP(3) NOT NULL,
        "halfDay" BOOLEAN NOT NULL DEFAULT false,
        "halfDaySession" "HalfDaySession",
        "totalDays" DOUBLE PRECISION NOT NULL,
        "reason" TEXT NOT NULL,
        "status" "LeaveStatus" NOT NULL DEFAULT 'PENDING',
        "attachmentUrl" TEXT,
        "appliedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "approvedById" TEXT,
        "approvedAt" TIMESTAMP(3),
        "rejectionReason" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id")
      );
    `);

    // 5.9. Create organizations table
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MembershipStatus') THEN
          CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'PENDING', 'SUSPENDED');
        END IF;
      END $$;
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "organizations" (
        "id"          TEXT NOT NULL,
        "name"        TEXT NOT NULL,
        "description" TEXT,
        "logoUrl"     TEXT,
        "website"     TEXT,
        "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "organizations_name_key" ON "organizations"("name");
    `);

    // Create payroll tables
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "payroll_cycles" (
        "id" TEXT NOT NULL,
        "month" TEXT NOT NULL,
        "year" INTEGER NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'PENDING_ATTENDANCE_LOCK',
        "organizationId" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "payroll_cycles_pkey" PRIMARY KEY ("id")
      );
    `);

    try {
      await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "payroll_cycles_month_year_key";`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "payroll_cycles" DROP CONSTRAINT IF EXISTS "payroll_cycles_month_year_key";`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "payroll_cycles" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;`);
    } catch (colErr: any) {}

    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "payroll_cycles_month_year_organizationId_key" ON "payroll_cycles"("month", "year", "organizationId");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "payroll_runs" (
        "id" TEXT NOT NULL,
        "employeeId" TEXT NOT NULL,
        "cycleId" TEXT NOT NULL,
        "basic" DOUBLE PRECISION NOT NULL,
        "hra" DOUBLE PRECISION NOT NULL,
        "allowance" DOUBLE PRECISION NOT NULL,
        "pf" DOUBLE PRECISION NOT NULL,
        "pt" DOUBLE PRECISION NOT NULL DEFAULT 200,
        "tds" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "bonus" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "arrear" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "deductions" DOUBLE PRECISION NOT NULL,
        "netSalary" DOUBLE PRECISION NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'PENDING',
        "organizationId" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "payroll_runs_pkey" PRIMARY KEY ("id")
      );
    `);

    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE "payroll_runs" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;`);
    } catch (colErr: any) {}

    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "payroll_runs_employeeId_cycleId_key" ON "payroll_runs"("employeeId", "cycleId");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "payroll_runs_organizationId_idx" ON "payroll_runs"("organizationId");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "payroll_exclusions" (
        "id" TEXT NOT NULL,
        "employeeId" TEXT NOT NULL,
        "cycleId" TEXT NOT NULL,
        "reason" TEXT,
        "organizationId" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "payroll_exclusions_pkey" PRIMARY KEY ("id")
      );
    `);

    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE "payroll_exclusions" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;`);
    } catch (colErr: any) {}

    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "payroll_exclusions_employeeId_cycleId_key" ON "payroll_exclusions"("employeeId", "cycleId");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "payroll_exclusions_organizationId_idx" ON "payroll_exclusions"("organizationId");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "loans" (
        "id" TEXT NOT NULL,
        "employeeId" TEXT NOT NULL,
        "principal" DOUBLE PRECISION NOT NULL,
        "balance" DOUBLE PRECISION NOT NULL,
        "emi" DOUBLE PRECISION NOT NULL,
        "purpose" TEXT,
        "status" TEXT NOT NULL DEFAULT 'ACTIVE',
        "approvedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "organizationId" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "loans_pkey" PRIMARY KEY ("id")
      );
    `);

    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE "loans" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;`);
    } catch (colErr: any) {}

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "loans_organizationId_idx" ON "loans"("organizationId");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "loan_transactions" (
        "id" TEXT NOT NULL,
        "loanId" TEXT NOT NULL,
        "amount" DOUBLE PRECISION NOT NULL,
        "type" TEXT NOT NULL DEFAULT 'REPAYMENT',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "loan_transactions_pkey" PRIMARY KEY ("id")
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "tax_declarations" (
        "id" TEXT NOT NULL,
        "employeeId" TEXT NOT NULL,
        "financialYear" TEXT NOT NULL,
        "sec80C" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "sec80D" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "declaredHra" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "organizationId" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "tax_declarations_pkey" PRIMARY KEY ("id")
      );
    `);

    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE "tax_declarations" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;`);
    } catch (colErr: any) {}

    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "tax_declarations_employeeId_financialYear_key" ON "tax_declarations"("employeeId", "financialYear");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "tax_declarations_organizationId_idx" ON "tax_declarations"("organizationId");
    `);

    // Create performance tables
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "performance_goals" (
        "id" TEXT NOT NULL,
        "employeeId" TEXT NOT NULL,
        "title" TEXT NOT NULL,
        "weight" TEXT NOT NULL,
        "kra" TEXT NOT NULL,
        "progress" INTEGER NOT NULL DEFAULT 0,
        "status" TEXT NOT NULL DEFAULT 'In Progress',
        "organizationId" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "performance_goals_pkey" PRIMARY KEY ("id")
      );
    `);

    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE "performance_goals" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;`);
    } catch (colErr: any) {}

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "performance_goals_organizationId_idx" ON "performance_goals"("organizationId");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "performance_feedbacks" (
        "id" TEXT NOT NULL,
        "employeeId" TEXT NOT NULL,
        "reviewer" TEXT NOT NULL,
        "relation" TEXT NOT NULL,
        "rating" DOUBLE PRECISION NOT NULL,
        "text" TEXT NOT NULL,
        "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "organizationId" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "performance_feedbacks_pkey" PRIMARY KEY ("id")
      );
    `);

    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE "performance_feedbacks" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;`);
    } catch (colErr: any) {}

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "performance_feedbacks_organizationId_idx" ON "performance_feedbacks"("organizationId");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "performance_appraisals" (
        "id" TEXT NOT NULL,
        "employeeId" TEXT NOT NULL,
        "rating" INTEGER NOT NULL,
        "cycle" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'PENDING',
        "organizationId" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "performance_appraisals_pkey" PRIMARY KEY ("id")
      );
    `);

    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE "performance_appraisals" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;`);
    } catch (colErr: any) {}

    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "performance_appraisals_employeeId_cycle_key" ON "performance_appraisals"("employeeId", "cycle");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "performance_appraisals_organizationId_idx" ON "performance_appraisals"("organizationId");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "performance_ratings" (
        "id" TEXT NOT NULL,
        "employeeId" TEXT NOT NULL,
        "month" TEXT NOT NULL,
        "rating" DOUBLE PRECISION NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'EXCEEDS EXPECTATIONS',
        "tasks" TEXT NOT NULL DEFAULT '95%',
        "quality" TEXT NOT NULL DEFAULT '4.5/5',
        "teamwork" TEXT NOT NULL DEFAULT '4.5/5',
        "feedback" TEXT,
        "givenBy" TEXT NOT NULL DEFAULT 'Super Admin',
        "organizationId" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "performance_ratings_pkey" PRIMARY KEY ("id")
      );
    `);

    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE "performance_ratings" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;`);
    } catch (colErr: any) {}

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "performance_ratings_organizationId_idx" ON "performance_ratings"("organizationId");
    `);

    // Create engagement tables
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "engagement_posts" (
        "id" TEXT NOT NULL,
        "authorName" TEXT NOT NULL,
        "authorRole" TEXT NOT NULL,
        "authorAvatar" TEXT,
        "content" TEXT NOT NULL,
        "image" TEXT,
        "likesCount" INTEGER NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "engagement_posts_pkey" PRIMARY KEY ("id")
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "engagement_comments" (
        "id" TEXT NOT NULL,
        "postId" TEXT NOT NULL,
        "userName" TEXT NOT NULL,
        "text" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "engagement_comments_pkey" PRIMARY KEY ("id")
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "engagement_post_likes" (
        "id" TEXT NOT NULL,
        "postId" TEXT NOT NULL,
        "employeeId" TEXT NOT NULL,
        CONSTRAINT "engagement_post_likes_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "engagement_post_likes_postId_employeeId_key" ON "engagement_post_likes"("postId", "employeeId");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "engagement_post_reactions" (
        "id" TEXT NOT NULL,
        "postId" TEXT NOT NULL,
        "employeeId" TEXT NOT NULL,
        "type" TEXT NOT NULL,
        CONSTRAINT "engagement_post_reactions_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "engagement_post_reactions_postId_employeeId_type_key" ON "engagement_post_reactions"("postId", "employeeId", "type");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "engagement_moods" (
        "id" TEXT NOT NULL,
        "employeeId" TEXT NOT NULL,
        "mood" TEXT NOT NULL,
        "weekKey" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "engagement_moods_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "engagement_moods_employeeId_weekKey_key" ON "engagement_moods"("employeeId", "weekKey");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "corporate_surveys" (
        "id" TEXT NOT NULL,
        "title" TEXT NOT NULL,
        "question" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'ACTIVE',
        "closesAt" TIMESTAMP(3) NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "corporate_surveys_pkey" PRIMARY KEY ("id")
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "corporate_survey_responses" (
        "id" TEXT NOT NULL,
        "surveyId" TEXT NOT NULL,
        "employeeId" TEXT NOT NULL,
        "rating" INTEGER NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "corporate_survey_responses_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "corporate_survey_responses_surveyId_employeeId_key" ON "corporate_survey_responses"("surveyId", "employeeId");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "travel_claims" (
        "id" TEXT NOT NULL,
        "employeeId" TEXT NOT NULL,
        "type" TEXT NOT NULL,
        "amount" DOUBLE PRECISION NOT NULL,
        "date" TEXT NOT NULL,
        "reason" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'Pending',
        "receiptUrl" TEXT,
        "organizationId" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "travel_claims_pkey" PRIMARY KEY ("id")
      );
    `);

    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE "travel_claims" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;`);
    } catch (colErr: any) {}

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "travel_claims_organizationId_idx" ON "travel_claims"("organizationId");
    `);

    // Create recruitment tables
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "job_requisitions" (
        "id" TEXT NOT NULL,
        "title" TEXT NOT NULL,
        "department" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'Open',
        "applicantsCount" INTEGER NOT NULL DEFAULT 0,
        "organizationId" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "job_requisitions_pkey" PRIMARY KEY ("id")
      );
    `);

    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE "job_requisitions" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;`);
    } catch (colErr: any) {}

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "job_requisitions_organizationId_idx" ON "job_requisitions"("organizationId");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "candidates" (
        "id" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "role" TEXT NOT NULL,
        "experience" TEXT NOT NULL,
        "email" TEXT NOT NULL,
        "stage" TEXT NOT NULL DEFAULT 'Applied',
        "bgvChecked" BOOLEAN NOT NULL DEFAULT FALSE,
        "contractSigned" BOOLEAN NOT NULL DEFAULT FALSE,
        "hardwareAssigned" BOOLEAN NOT NULL DEFAULT FALSE,
        "organizationId" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "candidates_pkey" PRIMARY KEY ("id")
      );
    `);

    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;`);
    } catch (colErr: any) {}

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "candidates_organizationId_idx" ON "candidates"("organizationId");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "timesheets" (
        "id" TEXT NOT NULL,
        "employeeId" TEXT NOT NULL,
        "project" TEXT NOT NULL,
        "task" TEXT NOT NULL,
        "monHours" DOUBLE PRECISION NOT NULL,
        "tueHours" DOUBLE PRECISION NOT NULL,
        "wedHours" DOUBLE PRECISION NOT NULL,
        "thuHours" DOUBLE PRECISION NOT NULL,
        "friHours" DOUBLE PRECISION NOT NULL,
        "totalHours" DOUBLE PRECISION NOT NULL,
        "week" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'Pending',
        "organizationId" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "timesheets_pkey" PRIMARY KEY ("id")
      );
    `);

    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE "timesheets" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;`);
    } catch (colErr: any) {}

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "timesheets_organizationId_idx" ON "timesheets"("organizationId");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "job_requisitions" (
        "id" TEXT NOT NULL,
        "title" TEXT NOT NULL,
        "department" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'Open',
        "applicantsCount" INTEGER NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "job_requisitions_pkey" PRIMARY KEY ("id")
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "leave_types" (
        "id" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "code" TEXT NOT NULL,
        "description" TEXT,
        "defaultDays" DOUBLE PRECISION NOT NULL,
        "carryForward" BOOLEAN NOT NULL DEFAULT FALSE,
        "maxCarryForward" DOUBLE PRECISION DEFAULT 0,
        "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
        "organizationId" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "leave_types_pkey" PRIMARY KEY ("id")
      );
    `);

    try {
      await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "leave_types_name_key";`);
      await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "leave_types_code_key";`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "leave_types" DROP CONSTRAINT IF EXISTS "leave_types_name_key";`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "leave_types" DROP CONSTRAINT IF EXISTS "leave_types_code_key";`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "leave_types" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;`);
    } catch (colErr: any) {}

    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "leave_types_name_organizationId_key" ON "leave_types"("name", "organizationId");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "leave_types_code_organizationId_key" ON "leave_types"("code", "organizationId");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "leave_allocations" (
        "id" TEXT NOT NULL,
        "employeeId" TEXT NOT NULL,
        "leaveTypeId" TEXT NOT NULL,
        "year" INTEGER NOT NULL,
        "allocated" DOUBLE PRECISION NOT NULL,
        "used" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "pending" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "carriedForward" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "organizationId" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "leave_allocations_pkey" PRIMARY KEY ("id")
      );
    `);

    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE "leave_allocations" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;`);
    } catch (colErr: any) {}

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "leave_allocations_organizationId_idx" ON "leave_allocations"("organizationId");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "leave_requests" (
        "id" TEXT NOT NULL,
        "employeeId" TEXT NOT NULL,
        "leaveTypeId" TEXT NOT NULL,
        "startDate" TIMESTAMP(3) NOT NULL,
        "endDate" TIMESTAMP(3) NOT NULL,
        "halfDay" BOOLEAN NOT NULL DEFAULT FALSE,
        "halfDaySession" TEXT,
        "totalDays" DOUBLE PRECISION NOT NULL,
        "reason" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'PENDING',
        "attachmentUrl" TEXT,
        "appliedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "approvedById" TEXT,
        "approvedAt" TIMESTAMP(3),
        "rejectionReason" TEXT,
        "organizationId" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id")
      );
    `);

    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE "leave_requests" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;`);
    } catch (colErr: any) {}

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "leave_requests_organizationId_idx" ON "leave_requests"("organizationId");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "candidates" (
        "id" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "role" TEXT NOT NULL,
        "experience" TEXT NOT NULL,
        "email" TEXT NOT NULL,
        "stage" TEXT NOT NULL DEFAULT 'Applied',
        "bgvChecked" BOOLEAN NOT NULL DEFAULT FALSE,
        "contractSigned" BOOLEAN NOT NULL DEFAULT FALSE,
        "hardwareAssigned" BOOLEAN NOT NULL DEFAULT FALSE,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "candidates_pkey" PRIMARY KEY ("id")
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "vault_documents" (
        "id" TEXT NOT NULL,
        "employeeId" TEXT NOT NULL,
        "organizationId" TEXT,
        "name" TEXT NOT NULL,
        "category" TEXT NOT NULL,
        "uploadedOn" TEXT NOT NULL,
        "expiresOn" TEXT,
        "status" TEXT NOT NULL DEFAULT 'Active',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "vault_documents_pkey" PRIMARY KEY ("id")
      );
    `);

    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE "vault_documents" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;`);
    } catch (colErr: any) {}

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "vault_documents_organizationId_idx" ON "vault_documents"("organizationId");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "assets" (
        "id" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "category" TEXT NOT NULL,
        "serial" TEXT NOT NULL,
        "employeeId" TEXT,
        "organizationId" TEXT,
        "status" TEXT NOT NULL DEFAULT 'In Stock',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
      );
    `);

    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;`);
    } catch (colErr: any) {}

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "assets_organizationId_idx" ON "assets"("organizationId");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "issued_letters" (
        "id" TEXT NOT NULL,
        "templateType" TEXT NOT NULL,
        "recipientName" TEXT NOT NULL,
        "recipientRole" TEXT NOT NULL,
        "joiningDate" TEXT,
        "salaryCtc" TEXT,
        "warningReason" TEXT,
        "organizationId" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "issued_letters_pkey" PRIMARY KEY ("id")
      );
    `);

    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE "issued_letters" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;`);
    } catch (colErr: any) {}

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "issued_letters_organizationId_idx" ON "issued_letters"("organizationId");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "help_tickets" (
        "id" TEXT NOT NULL,
        "employeeId" TEXT NOT NULL,
        "organizationId" TEXT,
        "subject" TEXT NOT NULL,
        "description" TEXT NOT NULL,
        "category" TEXT NOT NULL,
        "priority" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'Open',
        "slaHoursLeft" INTEGER NOT NULL,
        "date" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "help_tickets_pkey" PRIMARY KEY ("id")
      );
    `);

    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE "help_tickets" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;`);
    } catch (colErr: any) {}

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "help_tickets_organizationId_idx" ON "help_tickets"("organizationId");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "attendance_punches" (
        "id" TEXT NOT NULL,
        "employeeId" TEXT NOT NULL,
        "time" TEXT NOT NULL,
        "type" TEXT NOT NULL,
        "method" TEXT NOT NULL,
        "lat" DOUBLE PRECISION NOT NULL,
        "lng" DOUBLE PRECISION NOT NULL,
        "selfiePreview" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "attendance_punches_pkey" PRIMARY KEY ("id")
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "attendance_regularizations" (
        "id" TEXT NOT NULL,
        "employeeId" TEXT NOT NULL,
        "date" TEXT NOT NULL,
        "timeIn" TEXT NOT NULL,
        "timeOut" TEXT NOT NULL,
        "reason" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'Pending',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "attendance_regularizations_pkey" PRIMARY KEY ("id")
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "geofence_locations" (
        "id" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "lat" DOUBLE PRECISION NOT NULL,
        "lng" DOUBLE PRECISION NOT NULL,
        "radius" DOUBLE PRECISION NOT NULL,
        "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "geofence_locations_pkey" PRIMARY KEY ("id")
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "shift_rosters" (
        "id" TEXT NOT NULL,
        "employeeId" TEXT NOT NULL,
        "week" TEXT NOT NULL,
        "mon" TEXT NOT NULL DEFAULT 'General',
        "tue" TEXT NOT NULL DEFAULT 'General',
        "wed" TEXT NOT NULL DEFAULT 'General',
        "thu" TEXT NOT NULL DEFAULT 'General',
        "fri" TEXT NOT NULL DEFAULT 'General',
        "sat" TEXT NOT NULL DEFAULT 'Week Off',
        "sun" TEXT NOT NULL DEFAULT 'Week Off',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "shift_rosters_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "shift_rosters_employeeId_week_key" ON "shift_rosters"("employeeId", "week");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "shifts" (
        "id" TEXT NOT NULL,
        "organizationId" TEXT,
        "code" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "startTime" TEXT NOT NULL,
        "endTime" TEXT NOT NULL,
        "shortLabel" TEXT,
        "color" TEXT,
        "bgColor" TEXT,
        "isSystem" BOOLEAN NOT NULL DEFAULT FALSE,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "shifts_pkey" PRIMARY KEY ("id")
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "audit_logs" (
        "id" TEXT NOT NULL,
        "user" TEXT NOT NULL,
        "action" TEXT NOT NULL,
        "module" TEXT NOT NULL,
        "details" TEXT NOT NULL,
        "organizationId" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
      );
    `);

    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;`);
    } catch (colErr: any) {}

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "audit_logs_organizationId_idx" ON "audit_logs"("organizationId");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "holidays" (
        "id" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "type" TEXT NOT NULL,
        "date" TIMESTAMP(3) NOT NULL,
        "organizationId" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "holidays_pkey" PRIMARY KEY ("id")
      );
    `);

    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE "holidays" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;`);
    } catch (colErr: any) {}

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "holidays_organizationId_idx" ON "holidays"("organizationId");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "engagement_posts" (
        "id" TEXT NOT NULL,
        "authorName" TEXT NOT NULL,
        "authorRole" TEXT NOT NULL,
        "authorAvatar" TEXT,
        "content" TEXT NOT NULL,
        "image" TEXT,
        "likesCount" INTEGER NOT NULL DEFAULT 0,
        "organizationId" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "engagement_posts_pkey" PRIMARY KEY ("id")
      );
    `);

    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE "engagement_posts" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;`);
    } catch (colErr: any) {}

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "engagement_posts_organizationId_idx" ON "engagement_posts"("organizationId");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "corporate_surveys" (
        "id" TEXT NOT NULL,
        "title" TEXT NOT NULL,
        "question" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'ACTIVE',
        "closesAt" TIMESTAMP(3) NOT NULL,
        "organizationId" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "corporate_surveys_pkey" PRIMARY KEY ("id")
      );
    `);

    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE "corporate_surveys" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;`);
    } catch (colErr: any) {}

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "corporate_surveys_organizationId_idx" ON "corporate_surveys"("organizationId");
    `);

    // 5.10. Create memberships table (User 1-to-1 Membership, Membership Many-to-Many Organization)
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "memberships" (
        "id"             TEXT NOT NULL,
        "userId"         TEXT NOT NULL,
        "roleId"         TEXT,
        "status"         "MembershipStatus" NOT NULL DEFAULT 'PENDING',
        "joinedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "memberships_userId_key" ON "memberships"("userId");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "memberships_userId_idx" ON "memberships"("userId");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "memberships_roleId_idx" ON "memberships"("roleId");
    `);

    // Ensure memberships table has "roleId" column in case-sensitive format
    try {
      const membershipRoleColumnCheck = await prisma.$queryRawUnsafe<any[]>(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'memberships' AND column_name = 'roleId'
      `);
      if (membershipRoleColumnCheck.length === 0) {
        const membershipRoleLowercaseCheck = await prisma.$queryRawUnsafe<any[]>(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = 'memberships' AND column_name = 'roleid'
        `);
        if (membershipRoleLowercaseCheck.length > 0) {
          await prisma.$executeRawUnsafe(`ALTER TABLE "memberships" RENAME COLUMN "roleid" TO "roleId";`);
          console.log("[DB Sync] Renamed 'roleid' to 'roleId' in 'memberships' table.");
        } else {
          await prisma.$executeRawUnsafe(`ALTER TABLE "memberships" ADD COLUMN "roleId" TEXT;`);
          console.log("[DB Sync] Added 'roleId' column to 'memberships' table.");
        }
      }
    } catch (e) {
      // Ignore if column check fails
    }

    // 6. Setup foreign key constraints safely
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        -- users -> roles
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'users_roleId_fkey'
        ) THEN
          ALTER TABLE "users" ADD CONSTRAINT "users_roleId_fkey" 
          FOREIGN KEY ("roleId") REFERENCES "roles"("id") 
          ON DELETE SET NULL ON UPDATE CASCADE;
        END IF;

        -- join table A -> permissions
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = '_PermissionToRole_A_fkey'
        ) THEN
          ALTER TABLE "_PermissionToRole" ADD CONSTRAINT "_PermissionToRole_A_fkey" 
          FOREIGN KEY ("A") REFERENCES "permissions"("id") 
          ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;

        -- join table B -> roles
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = '_PermissionToRole_B_fkey'
        ) THEN
          ALTER TABLE "_PermissionToRole" ADD CONSTRAINT "_PermissionToRole_B_fkey" 
          FOREIGN KEY ("B") REFERENCES "roles"("id") 
          ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;

        -- departments -> users (managerId)
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'departments_managerId_fkey'
        ) THEN
          ALTER TABLE "departments" ADD CONSTRAINT "departments_managerId_fkey" 
          FOREIGN KEY ("managerId") REFERENCES "users"("id") 
          ON DELETE SET NULL ON UPDATE CASCADE;
        END IF;

        -- departments -> departments (parentId self-relation)
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'departments_parentId_fkey'
        ) THEN
          ALTER TABLE "departments" ADD CONSTRAINT "departments_parentId_fkey" 
          FOREIGN KEY ("parentId") REFERENCES "departments"("id") 
          ON DELETE SET NULL ON UPDATE CASCADE;
        END IF;

        -- employees -> users (userId)
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'employees_userId_fkey'
        ) THEN
          ALTER TABLE "employees" ADD CONSTRAINT "employees_userId_fkey" 
          FOREIGN KEY ("userId") REFERENCES "users"("id") 
          ON DELETE SET NULL ON UPDATE CASCADE;
        END IF;

        -- employees -> departments (departmentId)
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'employees_departmentId_fkey'
        ) THEN
          ALTER TABLE "employees" ADD CONSTRAINT "employees_departmentId_fkey" 
          FOREIGN KEY ("departmentId") REFERENCES "departments"("id") 
          ON DELETE SET NULL ON UPDATE CASCADE;
        END IF;

        -- employees -> employees (managerId self-relation)
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'employees_managerId_fkey'
        ) THEN
          ALTER TABLE "employees" ADD CONSTRAINT "employees_managerId_fkey" 
          FOREIGN KEY ("managerId") REFERENCES "employees"("id") 
          ON DELETE SET NULL ON UPDATE CASCADE;
        END IF;

        -- leave_allocations -> employees
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'leave_allocations_employeeId_fkey'
        ) THEN
          ALTER TABLE "leave_allocations" ADD CONSTRAINT "leave_allocations_employeeId_fkey" 
          FOREIGN KEY ("employeeId") REFERENCES "employees"("id") 
          ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;

        -- leave_allocations -> leave_types
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'leave_allocations_leaveTypeId_fkey'
        ) THEN
          ALTER TABLE "leave_allocations" ADD CONSTRAINT "leave_allocations_leaveTypeId_fkey" 
          FOREIGN KEY ("leaveTypeId") REFERENCES "leave_types"("id") 
          ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;

        -- leave_requests -> employees
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'leave_requests_employeeId_fkey'
        ) THEN
          ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_employeeId_fkey" 
          FOREIGN KEY ("employeeId") REFERENCES "employees"("id") 
          ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;

        -- leave_requests -> leave_types
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'leave_requests_leaveTypeId_fkey'
        ) THEN
          ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_leaveTypeId_fkey" 
          FOREIGN KEY ("leaveTypeId") REFERENCES "leave_types"("id") 
          ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;

        -- leave_requests -> users (approvedById)
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'leave_requests_approvedById_fkey'
        ) THEN
          ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_approvedById_fkey" 
          FOREIGN KEY ("approvedById") REFERENCES "users"("id") 
          ON DELETE SET NULL ON UPDATE CASCADE;
        END IF;

        -- memberships -> users
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'memberships_userId_fkey'
        ) THEN
          ALTER TABLE "memberships" ADD CONSTRAINT "memberships_userId_fkey" 
          FOREIGN KEY ("userId") REFERENCES "users"("id") 
          ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;



        -- memberships -> roles (org-level role assignment)
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'memberships_roleId_fkey'
        ) THEN
          ALTER TABLE "memberships" ADD CONSTRAINT "memberships_roleId_fkey" 
          FOREIGN KEY ("roleId") REFERENCES "roles"("id") 
          ON DELETE SET NULL ON UPDATE CASCADE;
        END IF;

        -- payroll_runs -> employees
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'payroll_runs_employeeId_fkey'
        ) THEN
          ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_employeeId_fkey" 
          FOREIGN KEY ("employeeId") REFERENCES "employees"("id") 
          ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;

        -- payroll_runs -> payroll_cycles
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'payroll_runs_cycleId_fkey'
        ) THEN
          ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_cycleId_fkey" 
          FOREIGN KEY ("cycleId") REFERENCES "payroll_cycles"("id") 
          ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;

        -- payroll_exclusions -> employees
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'payroll_exclusions_employeeId_fkey'
        ) THEN
          ALTER TABLE "payroll_exclusions" ADD CONSTRAINT "payroll_exclusions_employeeId_fkey" 
          FOREIGN KEY ("employeeId") REFERENCES "employees"("id") 
          ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;

        -- payroll_exclusions -> payroll_cycles
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'payroll_exclusions_cycleId_fkey'
        ) THEN
          ALTER TABLE "payroll_exclusions" ADD CONSTRAINT "payroll_exclusions_cycleId_fkey" 
          FOREIGN KEY ("cycleId") REFERENCES "payroll_cycles"("id") 
          ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;

        -- loans -> employees
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'loans_employeeId_fkey'
        ) THEN
          ALTER TABLE "loans" ADD CONSTRAINT "loans_employeeId_fkey" 
          FOREIGN KEY ("employeeId") REFERENCES "employees"("id") 
          ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;

        -- loan_transactions -> loans
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'loan_transactions_loanId_fkey'
        ) THEN
          ALTER TABLE "loan_transactions" ADD CONSTRAINT "loan_transactions_loanId_fkey" 
          FOREIGN KEY ("loanId") REFERENCES "loans"("id") 
          ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;

        -- tax_declarations -> employees
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'tax_declarations_employeeId_fkey'
        ) THEN
          ALTER TABLE "tax_declarations" ADD CONSTRAINT "tax_declarations_employeeId_fkey" 
          FOREIGN KEY ("employeeId") REFERENCES "employees"("id") 
          ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;

        -- performance_goals -> employees
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'performance_goals_employeeId_fkey'
        ) THEN
          ALTER TABLE "performance_goals" ADD CONSTRAINT "performance_goals_employeeId_fkey" 
          FOREIGN KEY ("employeeId") REFERENCES "employees"("id") 
          ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;

        -- performance_feedbacks -> employees
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'performance_feedbacks_employeeId_fkey'
        ) THEN
          ALTER TABLE "performance_feedbacks" ADD CONSTRAINT "performance_feedbacks_employeeId_fkey" 
          FOREIGN KEY ("employeeId") REFERENCES "employees"("id") 
          ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;

        -- performance_appraisals -> employees
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'performance_appraisals_employeeId_fkey'
        ) THEN
          ALTER TABLE "performance_appraisals" ADD CONSTRAINT "performance_appraisals_employeeId_fkey" 
          FOREIGN KEY ("employeeId") REFERENCES "employees"("id") 
          ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;

        -- engagement_comments -> engagement_posts
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'engagement_comments_postId_fkey'
        ) THEN
          ALTER TABLE "engagement_comments" ADD CONSTRAINT "engagement_comments_postId_fkey" 
          FOREIGN KEY ("postId") REFERENCES "engagement_posts"("id") 
          ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;

        -- engagement_post_likes -> engagement_posts
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'engagement_post_likes_postId_fkey'
        ) THEN
          ALTER TABLE "engagement_post_likes" ADD CONSTRAINT "engagement_post_likes_postId_fkey" 
          FOREIGN KEY ("postId") REFERENCES "engagement_posts"("id") 
          ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;

        -- engagement_post_likes -> employees
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'engagement_post_likes_employeeId_fkey'
        ) THEN
          ALTER TABLE "engagement_post_likes" ADD CONSTRAINT "engagement_post_likes_employeeId_fkey" 
          FOREIGN KEY ("employeeId") REFERENCES "employees"("id") 
          ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;

        -- engagement_post_reactions -> engagement_posts
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'engagement_post_reactions_postId_fkey'
        ) THEN
          ALTER TABLE "engagement_post_reactions" ADD CONSTRAINT "engagement_post_reactions_postId_fkey" 
          FOREIGN KEY ("postId") REFERENCES "engagement_posts"("id") 
          ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;

        -- engagement_post_reactions -> employees
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'engagement_post_reactions_employeeId_fkey'
        ) THEN
          ALTER TABLE "engagement_post_reactions" ADD CONSTRAINT "engagement_post_reactions_employeeId_fkey" 
          FOREIGN KEY ("employeeId") REFERENCES "employees"("id") 
          ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;

        -- engagement_moods -> employees
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'engagement_moods_employeeId_fkey'
        ) THEN
          ALTER TABLE "engagement_moods" ADD CONSTRAINT "engagement_moods_employeeId_fkey" 
          FOREIGN KEY ("employeeId") REFERENCES "employees"("id") 
          ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;

        -- corporate_survey_responses -> corporate_surveys
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'corporate_survey_responses_surveyId_fkey'
        ) THEN
          ALTER TABLE "corporate_survey_responses" ADD CONSTRAINT "corporate_survey_responses_surveyId_fkey" 
          FOREIGN KEY ("surveyId") REFERENCES "corporate_surveys"("id") 
          ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;

        -- corporate_survey_responses -> employees
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'corporate_survey_responses_employeeId_fkey'
        ) THEN
          ALTER TABLE "corporate_survey_responses" ADD CONSTRAINT "corporate_survey_responses_employeeId_fkey" 
          FOREIGN KEY ("employeeId") REFERENCES "employees"("id") 
          ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;

        -- travel_claims -> employees
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'travel_claims_employeeId_fkey'
        ) THEN
          ALTER TABLE "travel_claims" ADD CONSTRAINT "travel_claims_employeeId_fkey" 
          FOREIGN KEY ("employeeId") REFERENCES "employees"("id") 
          ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;

        -- timesheets -> employees
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'timesheets_employeeId_fkey'
        ) THEN
          ALTER TABLE "timesheets" ADD CONSTRAINT "timesheets_employeeId_fkey" 
          FOREIGN KEY ("employeeId") REFERENCES "employees"("id") 
          ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;

        -- vault_documents -> employees
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'vault_documents_employeeId_fkey'
        ) THEN
          ALTER TABLE "vault_documents" ADD CONSTRAINT "vault_documents_employeeId_fkey" 
          FOREIGN KEY ("employeeId") REFERENCES "employees"("id") 
          ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;

        -- assets -> employees
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'assets_employeeId_fkey'
        ) THEN
          ALTER TABLE "assets" ADD CONSTRAINT "assets_employeeId_fkey" 
          FOREIGN KEY ("employeeId") REFERENCES "employees"("id") 
          ON DELETE SET NULL ON UPDATE CASCADE;
        END IF;

        -- help_tickets -> employees
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'help_tickets_employeeId_fkey'
        ) THEN
          ALTER TABLE "help_tickets" ADD CONSTRAINT "help_tickets_employeeId_fkey" 
          FOREIGN KEY ("employeeId") REFERENCES "employees"("id") 
          ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;

        -- attendance_punches -> employees
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'attendance_punches_employeeId_fkey'
        ) THEN
          ALTER TABLE "attendance_punches" ADD CONSTRAINT "attendance_punches_employeeId_fkey" 
          FOREIGN KEY ("employeeId") REFERENCES "employees"("id") 
          ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;

        -- attendance_regularizations -> employees
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'attendance_regularizations_employeeId_fkey'
        ) THEN
          ALTER TABLE "attendance_regularizations" ADD CONSTRAINT "attendance_regularizations_employeeId_fkey" 
          FOREIGN KEY ("employeeId") REFERENCES "employees"("id") 
          ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;

      END $$;
    `);

    // 7. Roles are custom created and managed per organization, not pre-seeded globally.

    // 7.5 Seed default leave types if table is empty
    const leaveTypesCount = await prisma.$queryRawUnsafe(`SELECT COUNT(*) as count FROM "leave_types"`);
    const countVal = Number((leaveTypesCount as any)[0]?.count || 0);
    if (countVal === 0) {
      console.log("[DB Sync] Seeding default leave types...");
      await prisma.$executeRawUnsafe(`
        INSERT INTO "leave_types" ("id", "name", "code", "description", "defaultDays", "carryForward", "maxCarryForward", "isActive", "createdAt", "updatedAt") VALUES
        ('lt_sl', 'Sick Leave', 'SL', 'Paid time off for medical needs/recovery', 12, false, 0, true, NOW(), NOW()),
        ('lt_cl', 'Casual Leave', 'CL', 'Paid time off for personal/urgent matters', 12, false, 0, true, NOW(), NOW()),
        ('lt_el', 'Earned Leave', 'EL', 'Accrued annual leave balance', 18, true, 10, true, NOW(), NOW()),
        ('lt_lwp', 'Leave Without Pay', 'LWP', 'Unpaid leave requests', 365, false, 0, true, NOW(), NOW())
      `);
      console.log("[DB Sync] Seeded default leave types successfully!");
    }

    // 7.6 Seed default holidays if table is empty
    const holidaysCountObj = await prisma.$queryRawUnsafe(`SELECT COUNT(*) as count FROM "holidays"`);
    const holidaysCountVal = Number((holidaysCountObj as any)[0]?.count || 0);
    if (holidaysCountVal === 0) {
      console.log("[DB Sync] Seeding default holidays...");
      await prisma.$executeRawUnsafe(`
        INSERT INTO "holidays" ("id", "name", "type", "date", "createdAt", "updatedAt") VALUES
        ('hol_1', 'Independence Day', 'National Holiday', '2026-08-15 00:00:00', NOW(), NOW()),
        ('hol_2', 'Ganesh Chaturthi', 'Regional Holiday', '2026-09-14 00:00:00', NOW(), NOW()),
        ('hol_3', 'New Year', 'National Holiday', '2026-01-01 00:00:00', NOW(), NOW())
      `);
      console.log("[DB Sync] Seeded default holidays successfully!");
    }

    // 7.7 Seed default audit logs if table is empty
    const auditLogsCountObj = await prisma.$queryRawUnsafe(`SELECT COUNT(*) as count FROM "audit_logs"`);
    const auditLogsCountVal = Number((auditLogsCountObj as any)[0]?.count || 0);
    if (auditLogsCountVal === 0) {
      console.log("[DB Sync] Seeding default audit logs...");
      await prisma.$executeRawUnsafe(`
        INSERT INTO "audit_logs" ("id", "user", "action", "module", "details", "createdAt", "updatedAt") VALUES
        ('log_1', 'HR Admin (Karan Johar)', 'Approved Leave Request', 'Leave Management', 'Approved 4 days of Earned Leave for Ananya Roy (EMP008)', NOW(), NOW()),
        ('log_2', 'System', 'Asset Assigned', 'Asset Management', 'Assigned Asset AST-078 (ThinkPad L14) to Ananya Roy (EMP008)', NOW(), NOW()),
        ('log_3', 'HR Admin (Karan Johar)', 'Onboarded Employee', 'Employee Master', 'Completed post-onboarding tasks for Ananya Roy', NOW(), NOW()),
        ('log_4', 'CEO (Vikram Malhotra)', 'Posted Announcement', 'Employee Engagement', 'Announced Q2 customer satisfaction record', NOW(), NOW())
      `);
      console.log("[DB Sync] Seeded default audit logs successfully!");
    }

    // 8. Auto-assign ALL role-less users to SUPER_ADMIN and ensure SUPER_ADMIN has ALL permissions
    const allPermsList = await prisma.permission.findMany({ select: { id: true } });
    let superAdminRoleObj = await prisma.role.findFirst({
      where: { name: "SUPER_ADMIN" },
    });

    if (!superAdminRoleObj) {
      superAdminRoleObj = await prisma.role.create({
        data: {
          id: "role_super_admin",
          name: "SUPER_ADMIN",
          description: "Full system control with all permissions",
          isSystem: true,
          permissions: {
            connect: allPermsList.map((p) => ({ id: p.id })),
          },
        },
      });
    } else {
      await prisma.role.update({
        where: { id: superAdminRoleObj.id },
        data: {
          permissions: {
            set: allPermsList.map((p) => ({ id: p.id })),
          },
        },
      });
    }

    if (superAdminRoleObj) {
      // Roles are created custom by each organization via the Role & Permissions console.

      // Ensure info@symbosys.com user is seeded and promoted to SUPER_ADMIN with all permissions
      let infoUser = await prisma.user.findFirst({
        where: { OR: [{ email: "info@symbosys.com" }, { phone: "6200065370" }] }
      });
      if (!infoUser) {
        infoUser = await prisma.user.create({
          data: {
            email: "info@symbosys.com",
            phone: "6200065370",
            name: "Symbosys Admin",
            roleId: superAdminRoleObj.id,
          }
        });
        console.log("[DB Sync] Created user info@symbosys.com as SUPER_ADMIN.");
      } else if (infoUser.roleId !== superAdminRoleObj.id) {
        await prisma.user.update({
          where: { id: infoUser.id },
          data: { roleId: superAdminRoleObj.id }
        });
        console.log("[DB Sync] Successfully promoted info@symbosys.com to SUPER_ADMIN.");
      }

      // Ensure Organization Admins are NOT in the employees table
      // (Admins belong to users and memberships tables, not operational staff)
      try {
        await prisma.employee.deleteMany({
          where: {
            OR: [
              { email: "info@symbosys.com" },
              { id: "EMP001" },
              { userId: infoUser.id },
            ],
          },
        });
        console.log("[DB Sync] Verified: Organization Admin is not in employees table.");
      } catch (cleanErr: any) {
        console.warn("[DB Sync] Notice cleaning admin from employees:", cleanErr.message);
      }


    }


    // Seed/Validate permissions for CRUD operations across modules
    await seedPermissions();

    // Seed default subscription plans and comparison matrix
    await SubscriptionRepository.seedDefaultDataIfNeeded();

    // Print current users status for debugging
    const allUsers = await prisma.user.findMany({
      include: { role: true },
    });
    console.log(
      "[DB Sync] Current users in DB:",
      allUsers.map((u) => ({
        id: u.id,
        phone: u.phone,
        email: u.email,
        role: u.role?.name || "NONE",
      }))
    );

    console.log("[DB Sync] Role, Permission, and User relationships synchronized successfully!");
  } catch (error: any) {
    console.error("[DB Sync] Database sync failed:", error.message || error);
    throw error;
  }
}
