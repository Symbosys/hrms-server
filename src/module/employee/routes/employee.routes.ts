import { Router } from "express";
import { protect, hasPermission } from "../../../middlewares/auth.middleware.ts";
import {
  createEmployee,
  getEmployees,
  getEmployeeById,
  updateEmployee,
  deleteEmployee,
  getEmployeeSalary,
  updateEmployeeSalary,
  getEmployeePersonal,
  updateEmployeePersonal,
  getEmployeeFamily,
  addEmployeeFamilyMember,
  removeEmployeeFamilyMember,
  getEmployeeExit,
  saveEmployeeExit,
  getEmployeeCredentials,
  resetEmployeeCredentials,
} from "../controller/employee.controller.ts";

const router = Router();

// Protect all employee routes (user must be authenticated)
router.use(protect);

// Standard Employee CRUD routes
router.get("/", hasPermission("VIEW_EMPLOYEE_DIRECTORY", "VIEW_EMPLOYEE_MASTER", "VIEW_EMPLOYEES"), getEmployees);
router.get("/:id", hasPermission("VIEW_EMPLOYEE_DIRECTORY", "VIEW_EMPLOYEE_MASTER", "VIEW_EMPLOYEES"), getEmployeeById);
router.post("/", hasPermission("CREATE_EMPLOYEES"), createEmployee);
router.put("/:id", hasPermission("UPDATE_EMPLOYEE_MASTER", "UPDATE_EMPLOYEES"), updateEmployee);
router.delete("/:id", hasPermission("DELETE_EMPLOYEES"), deleteEmployee);

// Credentials Management (Org Admin or HR can reset employee credentials)
router.get("/:id/credentials", getEmployeeCredentials);
router.post("/:id/reset-credentials", hasPermission("UPDATE_EMPLOYEES", "UPDATE_EMPLOYEE_MASTER"), resetEmployeeCredentials);

// Salary Details routes
router.get("/:id/salary", getEmployeeSalary);
router.put("/:id/salary", hasPermission("UPDATE_SALARY_STRUCTURE", "UPDATE_PAYROLL"), updateEmployeeSalary);

// Personal Details routes
router.get("/:id/personal", getEmployeePersonal);
router.put("/:id/personal", updateEmployeePersonal);

// Family & Dependent Details routes
router.get("/:id/family", getEmployeeFamily);
router.post("/:id/family", addEmployeeFamilyMember);
router.delete("/:id/family/:familyId", removeEmployeeFamilyMember);

// Exit Management & F&F routes
router.get("/:id/exit", hasPermission("VIEW_EXIT_SETTLEMENT", "VIEW_EMPLOYEES"), getEmployeeExit);
router.post("/:id/exit", hasPermission("UPDATE_EXIT_SETTLEMENT", "UPDATE_EMPLOYEES"), saveEmployeeExit);
router.put("/:id/exit", hasPermission("UPDATE_EXIT_SETTLEMENT", "UPDATE_EMPLOYEES"), saveEmployeeExit);

export default router;
