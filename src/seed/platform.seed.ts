import crypto from "crypto";
import { prisma } from "../db/prisma.ts";

/**
 * Utility to hash plain-text passwords using SHA-256
 */
const hashPassword = (password: string): string => {
  return crypto.createHash("sha256").update(password).digest("hex");
};

/**
 * Seed data for Platform Management, Admin Users, & Subscriptions
 * (Static companies removed to keep directory purely dynamic)
 */
export async function seedPlatformData() {
  console.log("[Platform Seed] Starting platform data seeding...");

  const defaultPasswordHash = hashPassword("admin123");

  // 1. Ensure & Seed admin_users table
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "admin_users" (
        "id" TEXT PRIMARY KEY,
        "name" TEXT NOT NULL,
        "email" TEXT NOT NULL UNIQUE,
        "password" TEXT NOT NULL,
        "role" TEXT NOT NULL DEFAULT 'SUPER_ADMIN',
        "avatar" TEXT,
        "status" TEXT NOT NULL DEFAULT 'Active',
        "lastLoginAt" TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    const adminUsers = [
      {
        name: "Super Admin",
        email: "admin@hrms.com",
        password: defaultPasswordHash,
        role: "SUPER_ADMIN",
        status: "Active",
      },
      {
        name: "Platform Administrator",
        email: "platform@hrms.com",
        password: defaultPasswordHash,
        role: "PLATFORM_ADMIN",
        status: "Active",
      },
      {
        name: "Symbosys Admin",
        email: "info@symbosys.com",
        password: hashPassword("admin@123"),
        role: "SUPER_ADMIN",
        status: "Active",
      },
    ];

    for (const admin of adminUsers) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "admin_users" ("id", "name", "email", "password", "role", "status", "createdAt", "updatedAt")
         VALUES (gen_random_uuid()::text, $1, LOWER($2), $3, $4, $5, NOW(), NOW())
         ON CONFLICT ("email") DO UPDATE SET "password" = $3, "role" = $4, "status" = $5, "updatedAt" = NOW()`,
        admin.name,
        admin.email,
        admin.password,
        admin.role,
        admin.status
      );
      console.log(`[Platform Seed] Seeded admin user: ${admin.email}`);
    }
  } catch (err) {
    console.error("[Platform Seed] Error seeding admin_users:", err);
  }

  // 2. Ensure & Seed platform_admins table
  try {
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

    await prisma.$executeRawUnsafe(
      `INSERT INTO "platform_admins" ("id", "name", "email", "password", "role", "createdAt", "updatedAt")
       VALUES (gen_random_uuid()::text, 'Platform Administrator', 'platform@hrms.com', $1, 'PLATFORM_ADMIN', NOW(), NOW())
       ON CONFLICT ("email") DO UPDATE SET "password" = $1, "updatedAt" = NOW()`,
      defaultPasswordHash
    );
    console.log("[Platform Seed] Seeded platform_admins table");
  } catch (err) {
    console.error("[Platform Seed] Error seeding platform_admins:", err);
  }

  // 3. Ensure platform_companies table exists and clear static dummy companies
  try {
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

    // Remove static dummy seeded companies to keep platform companies purely dynamic
    await prisma.$executeRawUnsafe(`DELETE FROM "platform_companies" WHERE "id" LIKE 'comp_%' OR "id" LIKE 'company-%'`);
    console.log("[Platform Seed] Cleared static dummy companies from platform_companies");
  } catch (err) {
    console.error("[Platform Seed] Error ensuring platform_companies:", err);
  }

  // 4. Ensure & Seed subscription_plans table
  try {
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

    const plans = [
      {
        id: "plan_basic",
        code: "basic",
        name: "Starter Plan",
        tagline: "Essential HR toolkit for small teams and startups.",
        icon: "Send",
        iconBg: "#e0e7ff",
        price: 49,
        billing: "Billed annually ($588/yr)",
        btnText: "Start Starter Plan",
        btnStyle: "btn-outline",
        checkColor: "#4f46e5",
        popular: false,
        maxEmployees: 25,
        status: "ACTIVE",
        sortOrder: 1,
        features: [
          "Up to 25 Active Employee Master Profiles",
          "Web & Mobile Attendance Logging",
          "Basic Leave & Holiday Calendar",
          "Standard Document Vault Storage",
          "Email & Ticket Support Response",
        ],
      },
      {
        id: "plan_pro",
        code: "pro",
        name: "Professional Plan",
        tagline: "Complete HR automation suite for growing mid-sized firms.",
        icon: "Zap",
        iconBg: "#dbeafe",
        price: 149,
        billing: "Billed annually ($1,788/yr)",
        btnText: "Upgrade to Pro",
        btnStyle: "btn-primary-gradient",
        checkColor: "#2563eb",
        popular: true,
        maxEmployees: 100,
        status: "ACTIVE",
        sortOrder: 2,
        features: [
          "Up to 100 Active Employee Profiles",
          "GPS Geofencing & Selfie Attendance Punching",
          "Automated One-Click Payroll & Tax Processing",
          "Performance Appraisal (PMS) & KPI Tracking",
          "Custom Multi-Level Approval Workflows",
          "Priority 24/7 Phone & Live Chat Support",
        ],
      },
      {
        id: "plan_enterprise",
        code: "enterprise",
        name: "Enterprise Suite",
        tagline: "Dedicated infrastructure, security, and custom integrations.",
        icon: "ShieldCheck",
        iconBg: "#fae8ff",
        price: 399,
        billing: "Billed annually ($4,788/yr)",
        btnText: "Contact Enterprise Sales",
        btnStyle: "btn-outline",
        checkColor: "#9333ea",
        popular: false,
        maxEmployees: -1,
        status: "ACTIVE",
        sortOrder: 3,
        features: [
          "Unlimited Employee Profiles & Multi-Tenant Support",
          "Custom API Access & ERP Webhook Integrations",
          "Dedicated Success Account Manager",
          "SSO, SAML2, & Custom Audit Logs",
          "99.99% Guaranteed SLA Uptime Support",
        ],
      },
    ];

    for (const p of plans) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "subscription_plans" 
          ("id", "code", "name", "tagline", "icon", "iconBg", "price", "billing", "btnText", "btnStyle", "checkColor", "popular", "features", "maxEmployees", "status", "sortOrder", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW(), NOW())
         ON CONFLICT ("code") DO UPDATE SET 
          "name" = $3, "tagline" = $4, "price" = $7, "billing" = $8, "popular" = $12, "features" = $13, "maxEmployees" = $14, "updatedAt" = NOW()`,
        p.id,
        p.code,
        p.name,
        p.tagline,
        p.icon,
        p.iconBg,
        p.price,
        p.billing,
        p.btnText,
        p.btnStyle,
        p.checkColor,
        p.popular,
        p.features,
        p.maxEmployees,
        p.status,
        p.sortOrder
      );
    }
    console.log(`[Platform Seed] Seeded ${plans.length} subscription plans`);
  } catch (err) {
    console.error("[Platform Seed] Error seeding subscription_plans:", err);
  }

  // 5. Ensure & Seed subscription_feature_comparisons table
  try {
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

    const comparisons = [
      { id: "fc_1", label: "Max Employee Master Profiles", basic: "25 Employees", pro: "100 Employees", ent: "Unlimited", sortOrder: 1 },
      { id: "fc_2", label: "GPS & Geofenced Punching", basic: "Basic", pro: "Advanced", ent: "Enterprise GPS", sortOrder: 2 },
      { id: "fc_3", label: "Payroll Processing & Statutory", basic: "Manual Export", pro: "Automated 1-Click", ent: "Custom ERP Sync", sortOrder: 3 },
      { id: "fc_4", label: "Custom Approval Roles", basic: "Standard", pro: "Multi-level", ent: "Unlimited Granular", sortOrder: 4 },
      { id: "fc_5", label: "Security & Single Sign-On (SSO)", basic: "Email / OTP", pro: "2FA Included", ent: "SAML2 & Active Dir", sortOrder: 5 },
      { id: "fc_6", label: "Customer Support SLA", basic: "Email (48h)", pro: "Priority (4h)", ent: "24/7 Dedicated (1h)", sortOrder: 6 },
    ];

    for (const fc of comparisons) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "subscription_feature_comparisons" ("id", "label", "basic", "pro", "ent", "sortOrder", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
         ON CONFLICT ("id") DO UPDATE SET "label" = $2, "basic" = $3, "pro" = $4, "ent" = $5, "sortOrder" = $6, "updatedAt" = NOW()`,
        fc.id,
        fc.label,
        fc.basic,
        fc.pro,
        fc.ent,
        fc.sortOrder
      );
    }
    console.log(`[Platform Seed] Seeded ${comparisons.length} subscription feature comparisons`);
  } catch (err) {
    console.error("[Platform Seed] Error seeding subscription feature comparisons:", err);
  }

  console.log("[Platform Seed] Platform data seeding process completed successfully!");
}

// Execute directly if run via CLI (e.g. tsx src/seed/platform.seed.ts)
if (process.argv[1] && process.argv[1].includes("platform.seed")) {
  seedPlatformData()
    .then(() => {
      console.log("[Platform Seed] Execution finished cleanly.");
      prisma.$disconnect();
    })
    .catch((err) => {
      console.error("[Platform Seed] Fatal error during execution:", err);
      prisma.$disconnect();
      process.exit(1);
    });
}
