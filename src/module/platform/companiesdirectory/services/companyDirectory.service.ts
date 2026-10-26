import crypto from "crypto";
import { prisma } from "../../../../db/prisma.ts";
import { statusCode } from "../../../../types/types.ts";
import { ErrorResponse } from "../../../../utils/response.util.ts";
import { CompanyDirectoryRepository } from "../repo/companyDirectory.repo.ts";
import type {
  CompanyClientInput,
  ResetCompanyCredentialsInput,
} from "../validators/companyDirectory.validator.ts";

/**
 * Hash password using Node.js native crypto module (SHA256)
 */
const hashPassword = (password: string): string => {
  return crypto.createHash("sha256").update(password).digest("hex");
};

export class CompanyDirectoryService {
  static async getCompanies(search?: string, status?: string) {
    return await CompanyDirectoryRepository.findAllCompanies(search, status);
  }

  static async getCompanyById(id: string) {
    const company = await CompanyDirectoryRepository.findCompanyById(id);
    if (!company) {
      throw new ErrorResponse("Company not found", statusCode.Not_Found);
    }
    return company;
  }

  /**
   * Full organization onboarding flow:
   * 1. Create Organization record
   * 2. Create PlatformCompany record linked to Organization
   * 3. Create org-scoped SUPER_ADMIN Role with ALL permissions
   * 4. Create User account for the org admin (with provided email/password)
   * 5. Create Membership linking the user to the organization with the SUPER_ADMIN role
   *
   * All steps are wrapped in a single Prisma transaction for atomicity.
   */
  static async createCompany(data: CompanyClientInput) {
    const { adminName, adminEmail, adminPhone, adminPassword, ...companyData } = data;

    // If admin credentials are provided, perform full onboarding
    if (adminEmail && adminPassword) {
      // Check if admin email is already in use
      const existingUser = await prisma.user.findUnique({
        where: { email: adminEmail },
      });
      if (existingUser) {
        throw new ErrorResponse(
          `A user with email "${adminEmail}" already exists. Cannot create organization admin.`,
          statusCode.Conflict
        );
      }

      // Check if organization name is already taken
      const existingOrg = await prisma.organization.findUnique({
        where: { name: companyData.name },
      });
      if (existingOrg) {
        throw new ErrorResponse(
          `An organization named "${companyData.name}" already exists.`,
          statusCode.Conflict
        );
      }

      // Fetch ALL permissions to connect to the org's SUPER_ADMIN role
      const allPermissions = await prisma.permission.findMany();

      // Perform the full onboarding in a single transaction
      const result = await prisma.$transaction(async (tx) => {
        // Step 1: Create Organization
        const organization = await tx.organization.create({
          data: {
            name: companyData.name,
            email: companyData.contactEmail,
            industry: companyData.industry,
            status: "ACTIVE",
          },
        });

        // Step 2: Create org-scoped SUPER_ADMIN Role with all permissions
        const superAdminRole = await tx.role.create({
          data: {
            name: "SUPER_ADMIN",
            description: `Super Admin role for ${companyData.name} — full access to all modules`,
            isSystem: true,
            organizationId: organization.id,
            permissions: {
              connect: allPermissions.map((p) => ({ id: p.id })),
            },
          },
        });

        // Step 3: Create User account for the org admin
        const hashedPassword = hashPassword(adminPassword);
        const user = await tx.user.create({
          data: {
            name: adminName || companyData.name + " Admin",
            email: adminEmail,
            phone: adminPhone || null,
            password: hashedPassword,
            roleId: superAdminRole.id,
          },
        });

        // Step 4: Create Membership linking user to organization
        await tx.membership.create({
          data: {
            userId: user.id,
            organizationId: organization.id,
            roleId: superAdminRole.id,
            status: "ACTIVE",
          },
        });

        // Step 5: Create PlatformCompany record linked to Organization
        const onboardedDate =
          companyData.onboardedDate ||
          new Date().toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          });

        const platformCompany = await tx.platformCompany.create({
          data: {
            name: companyData.name,
            industry: companyData.industry,
            employeeCount: companyData.employeeCount,
            licenseTier: companyData.licenseTier,
            status: companyData.status,
            contactEmail: companyData.contactEmail,
            onboardedDate,
            organizationId: organization.id,
            iconName: companyData.iconName || "LightningIcon",
            iconColor: companyData.iconColor || "#4f46e5",
            iconBg: companyData.iconBg || "#ede9fe",
          },
        });

        return {
          platformCompany,
          organization,
          adminUser: {
            id: user.id,
            name: user.name,
            email: user.email,
            phone: user.phone,
          },
          superAdminRole: {
            id: superAdminRole.id,
            name: superAdminRole.name,
            permissionCount: allPermissions.length,
          },
        };
      });

      console.log(
        `[Onboarding] Organization "${companyData.name}" onboarded successfully. ` +
          `Org ID: ${result.organization.id}, Admin: ${adminEmail}, ` +
          `SUPER_ADMIN Role ID: ${result.superAdminRole.id} (${result.superAdminRole.permissionCount} permissions)`
      );

      return result;
    }

    // Fallback: create PlatformCompany only (legacy/simple mode without admin setup)
    const id = `company-${Date.now()}`;
    return await CompanyDirectoryRepository.createCompany(id, companyData);
  }

  static async updateCompany(id: string, data: Partial<CompanyClientInput>) {
    const updated = await CompanyDirectoryRepository.updateCompany(id, data);
    if (!updated) {
      throw new ErrorResponse("Company not found", statusCode.Not_Found);
    }
    return updated;
  }

  static async deleteCompany(id: string) {
    const company = await CompanyDirectoryRepository.findCompanyById(id);
    if (!company) {
      throw new ErrorResponse("Company not found", statusCode.Not_Found);
    }
    await CompanyDirectoryRepository.deleteCompany(id);
    return { success: true, message: "Company deleted successfully" };
  }

  /**
   * Reset credentials (Email and/or Password) for an Organization Admin.
   * Can be invoked by companyId (platform_companies) or organizationId (organizations).
   */
  static async resetCredentials(companyId: string, data: ResetCompanyCredentialsInput) {
    const rawPassword = (data.newPassword || data.password || "").trim();
    if (!rawPassword || rawPassword.length < 6) {
      throw new ErrorResponse("Password is required and must be at least 6 characters long", statusCode.Bad_Request);
    }

    const rawEmail = (data.newEmail || data.email || "").trim();
    const cleanEmail = rawEmail ? rawEmail.toLowerCase() : undefined;

    // 1. Resolve Organization:
    let organization = await prisma.organization.findUnique({
      where: { id: companyId },
    });

    let platformCompany: any = null;

    if (!organization) {
      const pComp = await prisma.platformCompany.findUnique({
        where: { id: companyId },
      });
      if (pComp) {
        platformCompany = pComp;
        if (pComp.organizationId) {
          organization = await prisma.organization.findUnique({
            where: { id: pComp.organizationId },
          });
        }
        if (!organization) {
          organization = await prisma.organization.findFirst({
            where: {
              OR: [
                { name: pComp.name },
                { email: pComp.contactEmail }
              ]
            }
          });
        }
      }
    }

    if (!organization) {
      const rawComp = await CompanyDirectoryRepository.findCompanyById(companyId);
      if (rawComp) {
        platformCompany = rawComp;
        organization = await prisma.organization.findFirst({
          where: {
            OR: [
              { id: rawComp.id },
              { name: rawComp.name },
              { email: rawComp.contactEmail }
            ]
          }
        });
      }
    }

    if (!organization) {
      throw new ErrorResponse(`Organization with ID "${companyId}" not found`, statusCode.Not_Found);
    }

    // 2. Resolve Admin User:
    let membership = await prisma.membership.findFirst({
      where: {
        organizationId: organization.id,
        role: { name: "SUPER_ADMIN" }
      },
      include: { user: true, role: true }
    });

    if (!membership) {
      membership = await prisma.membership.findFirst({
        where: { organizationId: organization.id },
        include: { user: true, role: true }
      });
    }

    let adminUser = membership?.user || null;

    if (!adminUser && organization.email) {
      adminUser = await prisma.user.findFirst({
        where: { email: { equals: organization.email, mode: "insensitive" } },
      });
    }

    if (!adminUser && platformCompany?.contactEmail) {
      adminUser = await prisma.user.findFirst({
        where: { email: { equals: platformCompany.contactEmail, mode: "insensitive" } },
      });
    }

    const hashedPassword = hashPassword(rawPassword);
    const targetEmail = cleanEmail || adminUser?.email || organization.email || platformCompany?.contactEmail;

    if (!targetEmail) {
      throw new ErrorResponse("An email address must be specified for the organization admin", statusCode.Bad_Request);
    }

    // Email conflict check
    if (adminUser && adminUser.email && adminUser.email.toLowerCase() !== targetEmail.toLowerCase()) {
      const emailConflict = await prisma.user.findFirst({
        where: {
          email: { equals: targetEmail, mode: "insensitive" },
          NOT: { id: adminUser.id }
        }
      });
      if (emailConflict) {
        throw new ErrorResponse(`Email "${targetEmail}" is already registered to another user`, statusCode.Conflict);
      }
    }

    if (!adminUser) {
      const existingUser = await prisma.user.findFirst({
        where: { email: { equals: targetEmail, mode: "insensitive" } }
      });
      if (existingUser) {
        adminUser = existingUser;
      }
    }

    // 3. Atomically update credentials in transaction
    const result = await prisma.$transaction(async (tx) => {
      // Ensure org-scoped SUPER_ADMIN role exists
      let superAdminRole = await tx.role.findFirst({
        where: {
          organizationId: organization.id,
          name: "SUPER_ADMIN",
        },
      });

      if (!superAdminRole) {
        const allPermissions = await tx.permission.findMany();
        superAdminRole = await tx.role.create({
          data: {
            name: "SUPER_ADMIN",
            description: `Super Admin role for ${organization.name} — full access to all modules`,
            isSystem: true,
            organizationId: organization.id,
            permissions: {
              connect: allPermissions.map((p) => ({ id: p.id })),
            },
          },
        });
      }

      let updatedUser;
      if (adminUser) {
        updatedUser = await tx.user.update({
          where: { id: adminUser.id },
          data: {
            email: targetEmail,
            password: hashedPassword,
            roleId: superAdminRole.id,
            updatedAt: new Date(),
          },
        });
      } else {
        updatedUser = await tx.user.create({
          data: {
            name: `${organization.name} Admin`,
            email: targetEmail,
            password: hashedPassword,
            roleId: superAdminRole.id,
          },
        });
      }

      // Ensure membership is active and linked to SUPER_ADMIN role
      const existingMembership = await tx.membership.findFirst({
        where: {
          userId: updatedUser.id,
          organizationId: organization.id,
        },
      });

      if (!existingMembership) {
        await tx.membership.create({
          data: {
            userId: updatedUser.id,
            organizationId: organization.id,
            roleId: superAdminRole.id,
            status: "ACTIVE",
          },
        });
      } else if (existingMembership.roleId !== superAdminRole.id || existingMembership.status !== "ACTIVE") {
        await tx.membership.update({
          where: { id: existingMembership.id },
          data: {
            roleId: superAdminRole.id,
            status: "ACTIVE",
          },
        });
      }

      // Update organization email
      await tx.organization.update({
        where: { id: organization.id },
        data: {
          email: targetEmail,
          updatedAt: new Date(),
        },
      });

      // Update platform_companies table record if exists
      await tx.platformCompany.updateMany({
        where: {
          OR: [
            { organizationId: organization.id },
            { id: companyId },
            { name: organization.name },
          ],
        },
        data: {
          contactEmail: targetEmail,
          organizationId: organization.id,
          updatedAt: new Date(),
        },
      });

      // Update any employee record linked to this user or email
      await tx.employee.updateMany({
        where: {
          OR: [
            { userId: updatedUser.id },
            { email: { equals: targetEmail, mode: "insensitive" } },
          ],
        },
        data: {
          email: targetEmail,
          password: hashedPassword,
          organizationId: organization.id,
          updatedAt: new Date(),
        },
      });

      return {
        organizationId: organization.id,
        organizationName: organization.name,
        adminUser: {
          id: updatedUser.id,
          name: updatedUser.name || `${organization.name} Admin`,
          email: updatedUser.email,
        },
        temporaryPassword: rawPassword,
        updatedAt: new Date().toISOString(),
      };
    });

    console.log(`[Credentials Reset] Credentials updated for organization "${result.organizationName}": Email=${result.adminUser.email}`);
    return result;
  }

  /**
   * Get current credentials and admin details for an organization
   */
  static async getCredentials(companyId: string) {
    let organization = await prisma.organization.findUnique({
      where: { id: companyId },
    });

    let platformCompany: any = null;

    if (!organization) {
      const pComp = await prisma.platformCompany.findUnique({
        where: { id: companyId },
      });
      if (pComp) {
        platformCompany = pComp;
        if (pComp.organizationId) {
          organization = await prisma.organization.findUnique({
            where: { id: pComp.organizationId },
          });
        }
        if (!organization) {
          organization = await prisma.organization.findFirst({
            where: {
              OR: [
                { name: pComp.name },
                { email: pComp.contactEmail }
              ]
            }
          });
        }
      }
    }

    if (!organization) {
      const rawComp = await CompanyDirectoryRepository.findCompanyById(companyId);
      if (rawComp) {
        platformCompany = rawComp;
        organization = await prisma.organization.findFirst({
          where: {
            OR: [
              { id: rawComp.id },
              { name: rawComp.name },
              { email: rawComp.contactEmail }
            ]
          }
        });
      }
    }

    if (!organization) {
      throw new ErrorResponse(`Organization with ID "${companyId}" not found`, statusCode.Not_Found);
    }

    let membership = await prisma.membership.findFirst({
      where: {
        organizationId: organization.id,
        role: { name: "SUPER_ADMIN" }
      },
      include: { user: true, role: true }
    });

    if (!membership) {
      membership = await prisma.membership.findFirst({
        where: { organizationId: organization.id },
        include: { user: true, role: true }
      });
    }

    let adminUser = membership?.user || null;
    if (!adminUser && organization.email) {
      adminUser = await prisma.user.findFirst({
        where: { email: { equals: organization.email, mode: "insensitive" } }
      });
    }
    if (!adminUser && platformCompany?.contactEmail) {
      adminUser = await prisma.user.findFirst({
        where: { email: { equals: platformCompany.contactEmail, mode: "insensitive" } }
      });
    }

    return {
      organizationId: organization.id,
      organizationName: organization.name,
      adminUser: adminUser ? {
        id: adminUser.id,
        name: adminUser.name,
        email: adminUser.email,
        phone: adminUser.phone,
        hasPasswordSet: !!adminUser.password,
      } : null,
      contactEmail: organization.email || platformCompany?.contactEmail || null,
      status: organization.status,
    };
  }
}
