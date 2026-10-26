import { prisma } from "../../../../db/prisma.ts";
import type { CompanyClientInput } from "../validators/companyDirectory.validator.ts";

export class CompanyDirectoryRepository {
  static async findAllCompanies(search?: string, status?: string) {
    let query = `
      SELECT 
        id,
        name,
        industry,
        "employeeCount",
        "licenseTier",
        status,
        "contactEmail",
        "onboardedDate",
        "iconName",
        "iconColor",
        "iconBg",
        "createdAt"
      FROM "platform_companies"
      UNION ALL
      SELECT 
        o.id,
        o.name,
        COALESCE(NULLIF(o.industry, ''), 'Enterprise Solutions') AS industry,
        (SELECT COUNT(*)::int FROM "memberships" m WHERE m."organizationId" = o.id) AS "employeeCount",
        'Enterprise' AS "licenseTier",
        CASE WHEN UPPER(o.status::text) = 'ACTIVE' THEN 'Active' ELSE 'Inactive' END AS status,
        COALESCE(o.email, '') AS "contactEmail",
        TO_CHAR(o."createdAt", 'Mon DD, YYYY') AS "onboardedDate",
        'BuildingIcon' AS "iconName",
        '#2563eb' AS "iconColor",
        '#dbeafe' AS "iconBg",
        o."createdAt"
      FROM "organizations" o
      WHERE o.id NOT IN (SELECT id FROM "platform_companies")
    `;

    const outerParams: any[] = [];
    let wrapperQuery = `SELECT * FROM (${query}) AS combined WHERE 1=1`;

    if (search && search.trim()) {
      outerParams.push(`%${search.trim().toLowerCase()}%`);
      wrapperQuery += ` AND (LOWER("name") LIKE $${outerParams.length} OR LOWER("industry") LIKE $${outerParams.length})`;
    }

    if (status && status !== "All") {
      outerParams.push(status);
      wrapperQuery += ` AND "status" = $${outerParams.length}`;
    }

    wrapperQuery += ` ORDER BY "createdAt" DESC`;

    return await prisma.$queryRawUnsafe<any[]>(wrapperQuery, ...outerParams);
  }

  static async findCompanyById(id: string) {
    const res = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM "platform_companies" WHERE "id" = $1 LIMIT 1`,
      id
    );
    if (res && res.length > 0) return res[0];

    const orgRes = await prisma.$queryRawUnsafe<any[]>(
      `SELECT 
        o.id,
        o.name,
        COALESCE(NULLIF(o.industry, ''), 'Enterprise Solutions') AS industry,
        (SELECT COUNT(*)::int FROM "memberships" m WHERE m."organizationId" = o.id) AS "employeeCount",
        'Enterprise' AS "licenseTier",
        CASE WHEN UPPER(o.status::text) = 'ACTIVE' THEN 'Active' ELSE 'Inactive' END AS status,
        COALESCE(o.email, '') AS "contactEmail",
        TO_CHAR(o."createdAt", 'Mon DD, YYYY') AS "onboardedDate",
        'BuildingIcon' AS "iconName",
        '#2563eb' AS "iconColor",
        '#dbeafe' AS "iconBg",
        o."createdAt"
       FROM "organizations" o
       WHERE o.id = $1 LIMIT 1`,
      id
    );
    return orgRes && orgRes.length > 0 ? orgRes[0] : null;
  }

  static async createCompany(id: string, data: CompanyClientInput) {
    const onboardedDate = data.onboardedDate || new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    const iconName = data.iconName || "LightningIcon";
    const iconColor = data.iconColor || "#4f46e5";
    const iconBg = data.iconBg || "#ede9fe";

    await prisma.$executeRawUnsafe(
      `INSERT INTO "platform_companies" ("id", "name", "industry", "employeeCount", "licenseTier", "status", "contactEmail", "onboardedDate", "iconName", "iconColor", "iconBg", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())`,
      id,
      data.name,
      data.industry,
      data.employeeCount,
      data.licenseTier,
      data.status,
      data.contactEmail,
      onboardedDate,
      iconName,
      iconColor,
      iconBg
    );

    return this.findCompanyById(id);
  }

  static async updateCompany(id: string, data: Partial<CompanyClientInput>) {
    const current = await this.findCompanyById(id);
    if (!current) return null;

    const name = data.name ?? current.name;
    const industry = data.industry ?? current.industry;
    const employeeCount = data.employeeCount ?? current.employeeCount;
    const licenseTier = data.licenseTier ?? current.licenseTier;
    const status = data.status ?? current.status;
    const contactEmail = data.contactEmail ?? current.contactEmail;
    const iconName = data.iconName ?? current.iconName;
    const iconColor = data.iconColor ?? current.iconColor;
    const iconBg = data.iconBg ?? current.iconBg;

    await prisma.$executeRawUnsafe(
      `UPDATE "platform_companies"
       SET "name" = $1, "industry" = $2, "employeeCount" = $3, "licenseTier" = $4, "status" = $5, "contactEmail" = $6, "iconName" = $7, "iconColor" = $8, "iconBg" = $9, "updatedAt" = NOW()
       WHERE "id" = $10`,
      name,
      industry,
      employeeCount,
      licenseTier,
      status,
      contactEmail,
      iconName,
      iconColor,
      iconBg,
      id
    );

    return this.findCompanyById(id);
  }

  static async deleteCompany(id: string) {
    await prisma.$executeRawUnsafe(`DELETE FROM "platform_companies" WHERE "id" = $1`, id);
    return true;
  }
}
