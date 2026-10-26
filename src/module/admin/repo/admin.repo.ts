import crypto from "crypto";
import { prisma } from "../../../db/prisma.ts";

export class AdminUserRepository {
  private static tableEnsured = false;

  /**
   * Ensures that the "admin_users" table exists in PostgreSQL database.
   * Auto-creates the table and default admin credentials if it doesn't exist yet.
   */
  private static async ensureTable() {
    if (this.tableEnsured) return;
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
      this.tableEnsured = true;

      // Seed default admin if empty
      const countRes = await prisma.$queryRawUnsafe<any[]>(
        `SELECT COUNT(*)::int as count FROM "admin_users"`
      );
      const count = countRes && countRes[0] ? Number(countRes[0].count) : 0;
      if (count === 0) {
        const defaultPasswordHash = crypto
          .createHash("sha256")
          .update("admin123")
          .digest("hex");
        await prisma.$executeRawUnsafe(
          `INSERT INTO "admin_users" ("id", "name", "email", "password", "role", "status", "createdAt", "updatedAt")
           VALUES (gen_random_uuid()::text, 'Super Admin', 'admin@hrms.com', $1, 'SUPER_ADMIN', 'Active', NOW(), NOW())
           ON CONFLICT ("email") DO NOTHING`,
          defaultPasswordHash
        );
      }
    } catch (err) {
      console.error("Failed to ensure admin_users table:", err);
    }
  }

  static async findByEmail(email: string) {
    const cleanEmail = (email || "").trim().toLowerCase();
    await this.ensureTable();
    try {
      if ((prisma as any).adminUser) {
        const admin = await (prisma as any).adminUser.findUnique({
          where: { email: cleanEmail },
        });
        if (admin) return admin;
      }
    } catch (e) {
      // Fallback to raw SQL query
    }

    try {
      const res = await prisma.$queryRawUnsafe<any[]>(
        `SELECT * FROM "admin_users" WHERE LOWER(TRIM("email")) = LOWER($1) LIMIT 1`,
        cleanEmail
      );
      return res && res.length > 0 ? res[0] : null;
    } catch (err) {
      return null;
    }
  }

  static async findById(id: string) {
    await this.ensureTable();
    try {
      if ((prisma as any).adminUser) {
        const admin = await (prisma as any).adminUser.findUnique({
          where: { id },
        });
        if (admin) return admin;
      }
    } catch (e) {}

    try {
      const res = await prisma.$queryRawUnsafe<any[]>(
        `SELECT * FROM "admin_users" WHERE "id" = $1 LIMIT 1`,
        id
      );
      return res && res.length > 0 ? res[0] : null;
    } catch (err) {
      return null;
    }
  }

  static async create(data: {
    name: string;
    email: string;
    password: string;
    role?: string;
    avatar?: string;
    status?: string;
  }) {
    await this.ensureTable();
    const roleVal = data.role || "SUPER_ADMIN";
    const statusVal = data.status || "Active";
    const avatarVal = data.avatar || null;

    try {
      if ((prisma as any).adminUser) {
        return await (prisma as any).adminUser.create({
          data: {
            name: data.name,
            email: data.email.toLowerCase(),
            password: data.password,
            role: roleVal,
            avatar: avatarVal,
            status: statusVal,
          },
        });
      }
    } catch (e) {}

    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "admin_users" ("id", "name", "email", "password", "role", "avatar", "status", "createdAt", "updatedAt")
         VALUES (gen_random_uuid()::text, $1, LOWER($2), $3, $4, $5, $6, NOW(), NOW())
         ON CONFLICT ("email") DO NOTHING`,
        data.name,
        data.email,
        data.password,
        roleVal,
        avatarVal,
        statusVal
      );
    } catch (err) {
      console.error("Error creating admin via raw SQL:", err);
    }
    return this.findByEmail(data.email);
  }

  static async updateLastLogin(id: string) {
    await this.ensureTable();
    try {
      if ((prisma as any).adminUser) {
        return await (prisma as any).adminUser.update({
          where: { id },
          data: { lastLoginAt: new Date() },
        });
      }
    } catch (e) {}

    try {
      await prisma.$executeRawUnsafe(
        `UPDATE "admin_users" SET "lastLoginAt" = NOW(), "updatedAt" = NOW() WHERE "id" = $1`,
        id
      );
    } catch (err) {}
  }

  static async findAll() {
    await this.ensureTable();
    try {
      if ((prisma as any).adminUser) {
        return await (prisma as any).adminUser.findMany({
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            avatar: true,
            status: true,
            lastLoginAt: true,
            createdAt: true,
            updatedAt: true,
          },
        });
      }
    } catch (e) {}

    try {
      return await prisma.$queryRawUnsafe<any[]>(
        `SELECT "id", "name", "email", "role", "avatar", "status", "lastLoginAt", "createdAt", "updatedAt" FROM "admin_users" ORDER BY "createdAt" DESC`
      );
    } catch (err) {
      return [];
    }
  }
}
