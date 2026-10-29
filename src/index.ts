import express from "express";
import env from "./config/env.config";
import { syncDatabase } from "./db/sync.ts";
import errorMiddleware from "./middlewares/error.middleware";
import adminRoutes from "./module/admin/routes/role.routes.ts";
import assetRoutes from "./module/asset/routes/asset.routes.ts";
import attendanceRoutes from "./module/attendance/routes/attendance.routes.ts";
import { AttendanceService } from "./module/attendance/services/attendance.service.ts";
import dashboardRoutes from "./module/dashboard/routes/dashboard.routes.ts";
import departmentRoutes from "./module/department/routes/department.routes.ts";
import documentRoutes from "./module/document/routes/document.routes.ts";
import employeeRoutes from "./module/employee/routes/employee.routes.ts";
import engagementRoutes from "./module/engagement/routes/engagement.routes.ts";
import helpdeskRoutes from "./module/helpdesk/routes/helpdesk.routes.ts";
import leaveRoutes from "./module/leave/routes/leave.routes.ts";
import letterRoutes from "./module/letter/routes/letter.routes.ts";
import organizationRoutes from "./module/organization/routes/organization.routes.ts";
import payrollRoutes from "./module/payroll/routes/payroll.routes.ts";
import performanceRoutes from "./module/performance/routes/performance.routes.ts";
import recruitmentRoutes from "./module/recruitment/routes/recruitment.routes.ts";
import subscriptionRoutes from "./module/subscription/routes/subscription.routes.ts";
import timesheetRoutes from "./module/timesheet/routes/timesheet.routes.ts";
import travelRoutes from "./module/travel/routes/travel.routes.ts";
import authRoutes from "./module/user/routes/auth.routes.ts";

import cors from "cors";

const app = express();

app.use(cors({
  origin: true,
  credentials: true
}));

app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ limit: "20mb", extended: true }));

// Request logger middleware
app.use((req, res, next) => {
  console.log(`[API HIT] ${new Date().toISOString()} - ${req.method} ${req.originalUrl || req.url} from ${req.ip}`);
  if (req.body && Object.keys(req.body).length > 0) {
    const sanitizedBody = { ...req.body };
    if (sanitizedBody.password) sanitizedBody.password = "******";
    console.log(`[API BODY]`, JSON.stringify(sanitizedBody));
  }
  next();
});

import adminAuthRoutes from "./module/admin/routes/admin.routes.ts";
import platformRoutes from "./module/platform/routes/platform.routes.ts";

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/platform", platformRoutes);
app.use("/api/v1/admin/auth", adminAuthRoutes);
app.use("/api/v1/admin", adminRoutes);
app.use("/api/v1/departments", departmentRoutes);
app.use("/api/v1/employees", employeeRoutes);
app.use("/api/v1/leaves", leaveRoutes);
app.use("/api/v1/organizations", organizationRoutes);
app.use("/api/v1/payroll", payrollRoutes);
app.use("/api/v1/performance", performanceRoutes);
app.use("/api/v1/engagement", engagementRoutes);
app.use("/api/v1/travel", travelRoutes);
app.use("/api/v1/timesheets", timesheetRoutes);
app.use("/api/v1/recruitment", recruitmentRoutes);
app.use("/api/v1/documents", documentRoutes);
app.use("/api/v1/assets", assetRoutes);
app.use("/api/v1/letters", letterRoutes);
app.use("/api/v1/helpdesk", helpdeskRoutes);
app.use("/api/v1/attendance", attendanceRoutes);
app.use("/api/v1/dashboard", dashboardRoutes);
app.use("/api/v1/subscriptions", subscriptionRoutes);




app.get("/", (req, res) => {
  res.json({
    message: "HRMS server running",
    nodeEnv: env.server.nodeEnv,
  });
});

const PORT = env.server.port;

app.use(errorMiddleware)

// Sync database and start server
syncDatabase().then(() => {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT} (0.0.0.0)`);
    // Run auto punch-out on startup and every 15 minutes to guarantee midnight 12:00 AM auto-punchout
    AttendanceService.autoPunchOutPendingUsers();
    setInterval(() => {
      AttendanceService.autoPunchOutPendingUsers();
    }, 15 * 60 * 1000);
  });
}).catch((err) => {
  console.error("Database sync failed, starting server anyway...", err);
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT} (0.0.0.0)`);
    AttendanceService.autoPunchOutPendingUsers();
    setInterval(() => {
      AttendanceService.autoPunchOutPendingUsers();
    }, 15 * 60 * 1000);
  });
});