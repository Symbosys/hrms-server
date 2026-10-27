import { DepartmentRepository } from "../repo/department.repo.ts";
import { ErrorResponse } from "../../../utils/response.util.ts";
import { statusCode } from "../../../types/types.ts";

export class DepartmentService {
  static async createDepartment(data: {
    name: string;
    code?: string;
    description?: string | null;
    managerId?: string | null;
    parentId?: string | null;
  }, organizationId?: string) {
    const cleanName = data.name.trim();
    let cleanCode = data.code?.trim().toUpperCase();
    if (!cleanCode) {
      const words = cleanName.split(/\s+/);
      if (words.length > 1) {
        cleanCode = words.map(w => w[0]).join('').toUpperCase().slice(0, 5);
      } else {
        cleanCode = cleanName.slice(0, 3).toUpperCase();
      }
    }

    const existingName = await DepartmentRepository.findByName(cleanName, organizationId);
    if (existingName) {
      throw new ErrorResponse(`Department with name "${cleanName}" already exists in this organization.`, statusCode.Conflict);
    }

    const existingCode = await DepartmentRepository.findByCode(cleanCode, organizationId);
    if (existingCode) {
      throw new ErrorResponse(`Department code "${cleanCode}" already exists in this organization.`, statusCode.Conflict);
    }

    let resolvedManagerId: string | null = null;
    if (data.managerId) {
      const manager = await DepartmentRepository.findUserById(data.managerId);
      if (!manager) {
        throw new ErrorResponse("Manager user not found", statusCode.Not_Found);
      }
      resolvedManagerId = manager.id;
    }

    if (data.parentId) {
      const parent = await DepartmentRepository.findById(data.parentId);
      if (!parent) {
        throw new ErrorResponse("Parent department not found", statusCode.Not_Found);
      }
    }

    return DepartmentRepository.create({
      ...data,
      name: cleanName,
      code: cleanCode,
      managerId: resolvedManagerId,
      organizationId: organizationId || null,
    });
  }

  static async getDepartments(organizationId?: string) {
    return DepartmentRepository.findAll(organizationId);
  }

  static async getDepartmentById(id: string) {
    const department = await DepartmentRepository.findById(id);
    if (!department) {
      throw new ErrorResponse("Department not found", statusCode.Not_Found);
    }
    return department;
  }

  static async updateDepartment(
    id: string,
    data: {
      name?: string;
      code?: string;
      description?: string;
      managerId?: string | null;
      parentId?: string | null;
    },
    organizationId?: string
  ) {
    const department = await DepartmentRepository.findById(id);
    if (!department) {
      throw new ErrorResponse("Department not found", statusCode.Not_Found);
    }

    if (data.name && data.name !== department.name) {
      const existingName = await DepartmentRepository.findByName(data.name, organizationId);
      if (existingName) {
        throw new ErrorResponse("Department name already in use", statusCode.Conflict);
      }
    }

    if (data.code && data.code !== department.code) {
      const existingCode = await DepartmentRepository.findByCode(data.code, organizationId);
      if (existingCode) {
        throw new ErrorResponse("Department code already in use", statusCode.Conflict);
      }
    }

    let resolvedManagerId: string | null | undefined = data.managerId;
    if (data.managerId) {
      const manager = await DepartmentRepository.findUserById(data.managerId);
      if (!manager) {
        throw new ErrorResponse("Manager user not found", statusCode.Not_Found);
      }
      resolvedManagerId = manager.id;
    }

    if (data.parentId) {
      if (data.parentId === id) {
        throw new ErrorResponse("A department cannot be its own parent", statusCode.Bad_Request);
      }
      const parent = await DepartmentRepository.findById(data.parentId);
      if (!parent) {
        throw new ErrorResponse("Parent department not found", statusCode.Not_Found);
      }
    }

    return DepartmentRepository.update(id, {
      ...data,
      managerId: resolvedManagerId
    });
  }

  static async deleteDepartment(id: string) {
    const department = await DepartmentRepository.findById(id);
    if (!department) {
      throw new ErrorResponse("Department not found", statusCode.Not_Found);
    }

    return DepartmentRepository.delete(id);
  }
}
