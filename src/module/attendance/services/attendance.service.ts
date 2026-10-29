import { prisma } from "../../../db/prisma.ts";
import { statusCode } from "../../../types/types.ts";
import { ErrorResponse } from "../../../utils/response.util.ts";
import { AttendanceRepository } from "../repo/attendance.repo.ts";

const formatPunchTime = (createdAt: Date, timeStr: string) => {
  if (!createdAt) return timeStr;
  const now = new Date();
  const punchDate = new Date(createdAt);
  
  let clockPart = timeStr;
  if (timeStr.includes(",")) {
    clockPart = timeStr.split(",")[1]?.trim() ?? timeStr;
  } else {
    const match = timeStr.match(/\d{1,2}:\d{2}\s*(?:AM|PM)/i);
    if (match) clockPart = match[0];
  }

  const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const punchMidnight = new Date(punchDate.getFullYear(), punchDate.getMonth(), punchDate.getDate()).getTime();

  const diffDays = Math.round((nowMidnight - punchMidnight) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return `Today, ${clockPart}`;
  } else if (diffDays === 1) {
    return `Yesterday, ${clockPart}`;
  } else if (diffDays > 1 && diffDays < 7) {
    const daysOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return `${daysOfWeek[punchDate.getDay()]}, ${clockPart}`;
  } else {
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const day = punchDate.getDate().toString().padStart(2, '0');
    const month = monthNames[punchDate.getMonth()];
    return `${day} ${month} ${punchDate.getFullYear()}, ${clockPart}`;
  }
};

export function parseTimeToMinutes(timeStr: string): number {
  if (!timeStr) return 9 * 60 + 30; // Default 09:30 AM (570 minutes)
  const cleaned = timeStr.trim().toUpperCase();
  const match = cleaned.match(/(\d{1,2}):(\d{2})(?:\s*(AM|PM))?/i);
  if (!match) return 9 * 60 + 30;
  let hours = parseInt(match[1] || "9", 10);
  const minutes = parseInt(match[2] || "30", 10);
  const meridiem = match[3];
  if (meridiem) {
    if (meridiem === "PM" && hours < 12) hours += 12;
    if (meridiem === "AM" && hours === 12) hours = 0;
  }
  return hours * 60 + minutes;
}

export class AttendanceService {
  static async getPunches(employeeId: string, organizationId?: string, requestingUser?: any) {
    // Auto punch-out pending users from previous days
    await this.autoPunchOutPendingUsers(organizationId);

    let userEmp: any = null;
    if (requestingUser) {
      const userConditions: any[] = [];
      if (requestingUser.id) userConditions.push({ userId: requestingUser.id });
      if (requestingUser.id) userConditions.push({ id: requestingUser.id });
      if (requestingUser.email) userConditions.push({ email: { equals: requestingUser.email, mode: "insensitive" } });
      if (requestingUser.phone) userConditions.push({ phone: requestingUser.phone });

      userEmp = await prisma.employee.findFirst({
        where: {
          OR: userConditions,
          ...(organizationId ? { organizationId } : {}),
        },
      });
    }

    const userRoleName = requestingUser?.role?.name || requestingUser?.role;
    const isAdmin = userRoleName === "Admin" || userRoleName === "HR Manager" || userRoleName === "SUPER_ADMIN" || requestingUser?.isPlatformAdmin;

    let resolvedId = employeeId;
    if (!isAdmin || employeeId === "EMP001" || employeeId === "me" || !employeeId) {
      if (userEmp) {
        resolvedId = userEmp.id;
      }
    }

    const emp = await prisma.employee.findFirst({
      where: {
        OR: [
          { id: resolvedId },
          { userId: resolvedId },
          { email: { equals: resolvedId, mode: "insensitive" } },
        ],
        ...(organizationId ? { organizationId } : {}),
      },
    });

    if (emp) {
      resolvedId = emp.id;
    } else if (userEmp) {
      resolvedId = userEmp.id;
    } else if (organizationId) {
      return [];
    }

    const targetUserId = emp?.userId || userEmp?.userId || undefined;
    const punches = await AttendanceRepository.findPunchesByEmployee(resolvedId, targetUserId);

    return punches.map((p) => ({
      id: p.id,
      employeeId: p.employeeId,
      time: formatPunchTime(p.createdAt, p.time),
      type: p.type,
      method: p.method,
      lat: p.lat,
      lng: p.lng,
      selfiePreview: p.selfiePreview,
      createdAt: p.createdAt ? p.createdAt.toISOString() : undefined,
    }));
  }

  static async createPunch(
    data: {
      employeeId: string;
      type: string;
      method: string;
      lat: number;
      lng: number;
      selfiePreview?: string | null;
    },
    organizationId?: string,
    requestingUser?: any
  ) {
    let userEmp: any = null;
    if (requestingUser) {
      const userConditions: any[] = [];
      if (requestingUser.id) userConditions.push({ userId: requestingUser.id });
      if (requestingUser.id) userConditions.push({ id: requestingUser.id });
      if (requestingUser.email) userConditions.push({ email: { equals: requestingUser.email, mode: "insensitive" } });
      if (requestingUser.phone) userConditions.push({ phone: requestingUser.phone });

      userEmp = await prisma.employee.findFirst({
        where: {
          OR: userConditions,
          ...(organizationId ? { organizationId } : {}),
        },
      });
    }

    const userRoleName = requestingUser?.role?.name || requestingUser?.role;
    const isAdmin = userRoleName === "Admin" || userRoleName === "HR Manager" || userRoleName === "SUPER_ADMIN" || requestingUser?.isPlatformAdmin;

    if ((!isAdmin || data.employeeId === "EMP001" || !data.employeeId) && userEmp) {
      data.employeeId = userEmp.id;
    }

    let employee = await prisma.employee.findUnique({
      where: { id: data.employeeId },
    });
    if (!employee || (organizationId && employee.organizationId !== organizationId)) {
      employee = await prisma.employee.findFirst({
        where: {
          OR: [
            { id: data.employeeId },
            { userId: data.employeeId },
            { email: { equals: data.employeeId, mode: "insensitive" } },
          ],
          ...(organizationId ? { organizationId } : {}),
        },
      });
      if (employee) {
        data.employeeId = employee.id;
      }
    }
    if (!employee && userEmp) {
      employee = userEmp;
      data.employeeId = userEmp.id;
    }
    if (!employee) {
      throw new ErrorResponse("Employee not found in your organization context", statusCode.Not_Found);
    }

    // Shift & Week Off Validation
    try {
      const days = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
      const dayIdx = new Date().getDay();
      const todayDayKey: string = days[dayIdx] ?? "mon";
      const roster = await prisma.shiftRoster.findFirst({
        where: {
          OR: [
            { employeeId: employee.id },
            ...(employee.userId ? [{ employeeId: employee.userId }] : []),
          ],
        },
        orderBy: { updatedAt: "desc" },
      });

      if (roster) {
        const todayShiftCode = String((roster as any)[todayDayKey] || "").trim().toUpperCase();
        if (todayShiftCode === "OFF" || todayShiftCode === "WEEK OFF" || todayShiftCode === "WEEKOFF" || todayShiftCode === "WO") {
          throw new ErrorResponse(
            `Punch restricted: Today is scheduled as your Week Off in your assigned shift roster.`,
            statusCode.Bad_Request
          );
        }
      }
    } catch (err: any) {
      if (err instanceof ErrorResponse) throw err;
      // otherwise proceed
    }

    // Geofencing Check
    const fences = await this.getGeofences(organizationId);
    const activeFences = fences.filter(f => f.isActive);

    if (activeFences.length > 0) {
      let isWithinAnyFence = false;
      let minDistance = Infinity;

      for (const fence of activeFences) {
        const dist = calculateDistance(data.lat, data.lng, fence.lat, fence.lng);
        if (dist <= fence.radius) {
          isWithinAnyFence = true;
          break;
        }
        if (dist < minDistance) {
          minDistance = dist;
        }
      }

      if (!isWithinAnyFence) {
        const distLabel = minDistance >= 1000 ? `${(minDistance / 1000).toFixed(1)}km` : `${Math.round(minDistance)}m`;
        data.method = `${data.method} (Out of Geofence - ${distLabel})`;
      }
    }

    // Format check time: e.g. "Today, 09:45 AM"
    const now = new Date();
    let timeString = "";
    try {
      const timeFormatted = now.toLocaleTimeString("en-US", {
        timeZone: "Asia/Kolkata",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
      timeString = `Today, ${timeFormatted}`;
    } catch (e) {
      let hours = now.getHours();
      const minutes = now.getMinutes().toString().padStart(2, "0");
      const ampm = hours >= 12 ? "PM" : "AM";
      hours = hours % 12;
      hours = hours ? hours : 12; // the hour '0' should be '12'
      timeString = `Today, ${hours.toString().padStart(2, "0")}:${minutes} ${ampm}`;
    }

    const isPunchIn = data.type.trim().toLowerCase() === "in";
    const isPunchOut = data.type.trim().toLowerCase() === "out";

    if (isPunchIn) {
      // Shift Start calculation: default 09:30 AM (570 mins)
      let shiftStartMins = 9 * 60 + 30;
      try {
        const days = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
        const istDate = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
        const todayDayKey: string = days[istDate.getDay()] ?? "mon";

        const roster = await prisma.shiftRoster.findFirst({
          where: {
            OR: [
              { employeeId: employee.id },
              ...(employee.userId ? [{ employeeId: employee.userId }] : []),
            ],
          },
          orderBy: { updatedAt: "desc" },
        });

        if (roster && (roster as any)[todayDayKey]) {
          const shiftCode = String((roster as any)[todayDayKey]).trim();
          const sh = await prisma.shift.findFirst({
            where: {
              OR: [
                { code: { equals: shiftCode, mode: "insensitive" } },
                { name: { equals: shiftCode, mode: "insensitive" } },
              ],
              ...(organizationId ? { organizationId } : {}),
            },
          });
          if (sh?.startTime) {
            shiftStartMins = parseTimeToMinutes(sh.startTime);
          }
        }

        const punchMinutes = istDate.getHours() * 60 + istDate.getMinutes();
        const lateMinutes = punchMinutes - shiftStartMins;

        if (lateMinutes > 15) {
          // Over 15 minutes late (> 9:45 AM) -> Half Day!
          data.method = `${data.method} (Late: ${lateMinutes}m - Half Day)`;
        } else if (lateMinutes > 0) {
          // 1 to 15 minutes late -> Late (Grace period)
          data.method = `${data.method} (Late: ${lateMinutes}m)`;
        } else {
          // On time
          data.method = `${data.method} (On Time)`;
        }
      } catch (err) {
        console.warn("[AttendanceService] Could not evaluate shift lateness:", err);
      }
    } else if (isPunchOut) {
      // Punch-out worked duration check:
      // If worked < 8 hours -> Half Day!
      // If worked >= 8 hours -> Full Day!
      try {
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        const lastInPunch = await prisma.attendancePunch.findFirst({
          where: {
            employeeId: employee.id,
            type: { in: ["In", "IN", "in"] },
            createdAt: { gte: startOfToday },
          },
          orderBy: { createdAt: "desc" },
        });

        if (lastInPunch) {
          const diffMs = now.getTime() - new Date(lastInPunch.createdAt).getTime();
          const workedHours = diffMs / (1000 * 60 * 60);
          const workedFormatted = workedHours.toFixed(1);

          if (workedHours < 8.0) {
            data.method = `${data.method} (Worked: ${workedFormatted}h - Half Day (<8h))`;
          } else {
            data.method = `${data.method} (Worked: ${workedFormatted}h - Full Day (>=8h))`;
          }
        } else {
          data.method = `${data.method} (Direct Logout)`;
        }
      } catch (err) {
        console.warn("[AttendanceService] Could not evaluate worked duration:", err);
      }
    }

    return AttendanceRepository.createPunch({
      ...data,
      time: timeString,
    });
  }

  static async getRegularizations(organizationId?: string) {
    const regs = await AttendanceRepository.findRegularizations(organizationId);

    return regs.map((r) => ({
      id: r.id,
      employeeName: r.employee.name,
      employeeId: r.employeeId,
      date: r.date,
      timeIn: r.timeIn,
      timeOut: r.timeOut,
      reason: r.reason,
      status: r.status,
    }));
  }

  static async applyRegularization(
    data: {
      employeeId: string;
      date: string;
      timeIn: string;
      timeOut: string;
      reason: string;
    },
    organizationId?: string,
    requestingUser?: any
  ) {
    let userEmp: any = null;
    if (requestingUser) {
      const userConditions: any[] = [];
      if (requestingUser.id) userConditions.push({ userId: requestingUser.id });
      if (requestingUser.id) userConditions.push({ id: requestingUser.id });
      if (requestingUser.email) userConditions.push({ email: { equals: requestingUser.email, mode: "insensitive" } });
      if (requestingUser.phone) userConditions.push({ phone: requestingUser.phone });

      userEmp = await prisma.employee.findFirst({
        where: {
          OR: userConditions,
          ...(organizationId ? { organizationId } : {}),
        },
      });
    }

    const userRoleName = requestingUser?.role?.name || requestingUser?.role;
    const isAdmin = userRoleName === "Admin" || userRoleName === "HR Manager" || userRoleName === "SUPER_ADMIN" || requestingUser?.isPlatformAdmin;

    if ((!isAdmin || data.employeeId === "EMP001" || !data.employeeId) && userEmp) {
      data.employeeId = userEmp.id;
    }

    let employee = await prisma.employee.findUnique({
      where: { id: data.employeeId },
    });
    if (!employee || (organizationId && employee.organizationId !== organizationId)) {
      employee = await prisma.employee.findFirst({
        where: {
          OR: [
            { id: data.employeeId },
            { userId: data.employeeId },
            { email: { equals: data.employeeId, mode: "insensitive" } },
          ],
          ...(organizationId ? { organizationId } : {}),
        },
      });
      if (employee) {
        data.employeeId = employee.id;
      }
    }
    if (!employee && userEmp) {
      employee = userEmp;
      data.employeeId = userEmp.id;
    }
    if (!employee) {
      throw new ErrorResponse("Employee not found in your organization context", statusCode.Not_Found);
    }

    // Standardize input times: convert HH:mm to 12-hour AM/PM format for consistency in reports
    const convertTo12Hour = (timeStr: string) => {
      const [h, m] = timeStr.split(":");
      const hours = parseInt(h || "0");
      const ampm = hours >= 12 ? "PM" : "AM";
      const h12 = hours % 12 || 12;
      return `${h12.toString().padStart(2, "0")}:${m} ${ampm}`;
    };

    const formattedTimeIn = data.timeIn.includes(" ") ? data.timeIn : convertTo12Hour(data.timeIn);
    const formattedTimeOut = data.timeOut.includes(" ") ? data.timeOut : convertTo12Hour(data.timeOut);

    return AttendanceRepository.createRegularization({
      ...data,
      employeeId: employee.id,
      timeIn: formattedTimeIn,
      timeOut: formattedTimeOut,
    });
  }

  static async updateRegularization(id: string, status: string, organizationId?: string) {
    const req = await AttendanceRepository.findRegularizationById(id);
    if (!req) {
      throw new ErrorResponse("Regularization request not found", statusCode.Not_Found);
    }

    if (organizationId) {
      const emp = await prisma.employee.findFirst({
        where: { id: req.employeeId, organizationId },
      });
      if (!emp) {
        throw new ErrorResponse("You do not have permission to modify this regularization request", statusCode.Forbidden);
      }
    }

    return AttendanceRepository.updateRegularizationStatus(id, status);
  }

  static async getGeofences(organizationId?: string) {
    const geofences = await AttendanceRepository.findGeofences();
    return geofences;
  }

  static async createGeofence(data: {
    name: string;
    lat: number;
    lng: number;
    radius: number;
    isActive?: boolean;
  }, organizationId?: string) {
    return AttendanceRepository.createGeofence(data);
  }

  static async deleteGeofence(id: string, organizationId?: string) {
    const existing = await AttendanceRepository.findGeofenceById(id);
    if (!existing) {
      return { id };
    }
    await AttendanceRepository.deleteGeofence(id);
    return { id };
  }

  static async getRosters(week: string, organizationId?: string) {
    return AttendanceRepository.findRostersByWeek(week, organizationId);
  }

  static async getShiftTimings(organizationId?: string) {
    return AttendanceRepository.findShifts(organizationId);
  }

  static async createShiftTiming(data: any, organizationId?: string) {
    const shiftData = {
      id: `ST_${Date.now()}`,
      name: data.name,
      code: data.code || data.name?.toUpperCase().replace(/\s+/g, "_") || "SHIFT",
      startTime: data.startTime || "09:00 AM",
      endTime: data.endTime || "06:00 PM",
      shortLabel: data.shortLabel || data.code || "S",
      color: data.color || "#10b981",
      bgColor: data.bgColor || "rgba(16, 185, 129, 0.12)",
      organizationId: organizationId || data.organizationId || null,
    };
    return AttendanceRepository.createShift(shiftData);
  }

  static async deleteShiftTiming(id: string, organizationId?: string) {
    return AttendanceRepository.deleteShift(id, organizationId);
  }

  static async saveRosters(
    week: string,
    rosters: Array<{
      employeeId: string;
      mon: string;
      tue: string;
      wed: string;
      thu: string;
      fri: string;
      sat: string;
      sun: string;
    }>,
    organizationId?: string
  ) {
    const results = [];
    for (const item of rosters) {
      let emp = await prisma.employee.findFirst({
        where: {
          OR: [
            { id: item.employeeId },
            { userId: item.employeeId },
            { email: { equals: item.employeeId, mode: "insensitive" } },
          ],
          ...(organizationId ? { organizationId } : {}),
        },
      });

      if (!emp && organizationId) {
        emp = await prisma.employee.findFirst({
          where: {
            OR: [
              { id: item.employeeId },
              { userId: item.employeeId },
              { email: { equals: item.employeeId, mode: "insensitive" } },
            ],
          },
        });
      }

      if (!emp) {
        console.warn(`[Attendance Service] Employee with ID '${item.employeeId}' not found in DB. Skipping roster item.`);
        continue;
      }

      const res = await AttendanceRepository.upsertRoster({
        ...item,
        employeeId: emp.id,
        week,
      });
      results.push(res);
    }
    return results;
  }

  /**
   * Automatic punch-out for employees who punched In but forgot to punch Out by midnight (12:00 AM).
   * Runs as a background task, on server startup, and prior to querying attendance records.
   */
  static async autoPunchOutPendingUsers(organizationId?: string) {
    try {
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

      // Find all In punches created before today
      const pendingInPunches = await prisma.attendancePunch.findMany({
        where: {
          type: { in: ["In", "IN", "in"] },
          createdAt: { lt: startOfToday },
          ...(organizationId
            ? {
                employee: {
                  organizationId,
                },
              }
            : {}),
        },
        orderBy: { createdAt: "asc" },
      });

      for (const inPunch of pendingInPunches) {
        const punchCreatedAt = new Date(inPunch.createdAt);
        const startOfDay = new Date(punchCreatedAt.getFullYear(), punchCreatedAt.getMonth(), punchCreatedAt.getDate(), 0, 0, 0, 0);
        const endOfDay = new Date(punchCreatedAt.getFullYear(), punchCreatedAt.getMonth(), punchCreatedAt.getDate(), 23, 59, 59, 999);

        const hasOut = await prisma.attendancePunch.findFirst({
          where: {
            employeeId: inPunch.employeeId,
            type: { in: ["Out", "OUT", "out"] },
            createdAt: {
              gte: startOfDay,
              lte: new Date(endOfDay.getTime() + 60 * 60 * 1000), // up to 1hr past midnight
            },
          },
        });

        if (!hasOut) {
          const midnight = endOfDay;
          const diffMs = midnight.getTime() - punchCreatedAt.getTime();
          const workedHours = (diffMs / (1000 * 60 * 60)).toFixed(1);

          await prisma.attendancePunch.create({
            data: {
              employeeId: inPunch.employeeId,
              type: "Out",
              method: `Auto Punch-Out (System 12:00 AM - Worked: ${workedHours}h)`,
              time: "12:00 AM (Auto Punch-Out)",
              lat: inPunch.lat || 0,
              lng: inPunch.lng || 0,
              createdAt: midnight,
              updatedAt: midnight,
            },
          });
        }
      }
    } catch (err) {
      console.error("[AttendanceService] Error in autoPunchOutPendingUsers:", err);
    }
  }

  /**
   * Retrieves full monthly Muster Roll matrix and attendance statistics
   * Evaluates on-time/late arrival (>15m = Half Day, 1-15m = Late), 8-hour worked threshold,
   * week offs, approved leaves, and automatic punch outs.
   */
  static async getMusterRoll(
    query: {
      month?: number | string;
      year?: number | string;
      employeeId?: string;
    },
    organizationId?: string,
    requestingUser?: any
  ) {
    // 1. Auto punch-out pending users from previous days
    await this.autoPunchOutPendingUsers(organizationId);

    const now = new Date();
    const targetMonth = query.month ? parseInt(String(query.month), 10) : (now.getMonth() + 1);
    const targetYear = query.year ? parseInt(String(query.year), 10) : now.getFullYear();

    const daysInMonth = new Date(targetYear, targetMonth, 0).getDate();
    const startDate = new Date(targetYear, targetMonth - 1, 1, 0, 0, 0, 0);
    const endDate = new Date(targetYear, targetMonth, 0, 23, 59, 59, 999);

    // 2. Privilege and Role resolution
    const userRoleName = (requestingUser?.role?.name || requestingUser?.role || "").toUpperCase();
    const isPrivileged = !!(
      requestingUser?.isPlatformAdmin ||
      ["SUPER_ADMIN", "ADMIN", "ORGANIZATION ADMIN", "HR MANAGER", "HR_ADMIN", "HR ADMIN"].includes(userRoleName)
    );

    let targetEmployeeId = query.employeeId;

    if (!isPrivileged && requestingUser) {
      // Regular employee: lock strictly to their own employee ID
      const userEmp = await prisma.employee.findFirst({
        where: {
          OR: [
            ...(requestingUser.employeeId ? [{ id: requestingUser.employeeId }] : []),
            ...(requestingUser.id ? [{ userId: requestingUser.id }] : []),
            ...(requestingUser.email ? [{ email: { equals: requestingUser.email, mode: "insensitive" as any } }] : []),
          ],
          ...(organizationId ? { organizationId } : {}),
        },
      });
      if (userEmp) {
        targetEmployeeId = userEmp.id;
      }
    }

    // 3. Fetch employees belonging to organization
    const employeeWhere: any = {
      status: { not: "TERMINATED" as any },
    };

    if (organizationId) {
      employeeWhere.organizationId = organizationId;
    }

    if (targetEmployeeId) {
      employeeWhere.OR = [
        { id: targetEmployeeId },
        { userId: targetEmployeeId },
      ];
    }

    if (isPrivileged) {
      // Organization / Admin should see all employees created under this organization,
      // but should NOT see itself (Organization Admin / SUPER_ADMIN / info@symbosys.com / logged-in admin user)
      employeeWhere.NOT = [
        { user: { role: { name: { in: ["SUPER_ADMIN", "Organization Admin", "ORGANIZATION ADMIN", "Super Admin"] } } } },
        { email: "info@symbosys.com" },
        ...(requestingUser?.id ? [{ userId: requestingUser.id }] : []),
        ...(requestingUser?.email ? [{ email: { equals: requestingUser.email, mode: "insensitive" as any } }] : []),
        ...(requestingUser?.employeeId ? [{ id: requestingUser.employeeId }] : []),
      ];
    }

    const employees = await prisma.employee.findMany({
      where: employeeWhere,
      select: {
        id: true,
        name: true,
        email: true,
        designation: true,
        avatar: true,
        userId: true,
        department: {
          select: {
            name: true,
          },
        },
      },
      orderBy: { name: "asc" },
    });

    const empIds = employees.map(e => e.id);
    const userIds = employees.map(e => e.userId).filter(Boolean) as string[];
    const allEmployeeKeys = Array.from(new Set([...empIds, ...userIds]));

    // 3. Fetch punches, leaves, regularizations, rosters, shifts
    const [punches, leaves, regularizations, rosters, shifts] = await Promise.all([
      prisma.attendancePunch.findMany({
        where: {
          employeeId: { in: allEmployeeKeys },
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.leaveRequest.findMany({
        where: {
          employeeId: { in: allEmployeeKeys },
          status: "APPROVED",
          startDate: { lte: endDate },
          endDate: { gte: startDate },
        },
      }),
      prisma.attendanceRegularization.findMany({
        where: {
          employeeId: { in: allEmployeeKeys },
          status: "Approved",
        },
      }),
      prisma.shiftRoster.findMany({
        where: {
          employeeId: { in: allEmployeeKeys },
        },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.shift.findMany({
        where: organizationId ? { organizationId } : {},
      }),
    ]);

    const dayNames = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    let totalMonthPresentDays = 0;
    let totalMonthLateDays = 0;
    let totalMonthHalfDays = 0;
    let totalMonthAbsentDays = 0;
    let totalMonthWeekOffDays = 0;
    let totalMonthLeaveDays = 0;

    let todayPresent = 0;
    let todayAbsent = 0;
    let todayLate = 0;
    let todayHalfDay = 0;
    let todayLeave = 0;
    let todayWeekOff = 0;

    const employeeRecords = employees.map(emp => {
      let empPresent = 0;
      let empLate = 0;
      let empHalfDay = 0;
      let empAbsent = 0;
      let empWeekOff = 0;
      let empLeave = 0;
      let empWorkedHours = 0;

      const empRoster = rosters.find(r => r.employeeId === emp.id || r.employeeId === emp.userId);

      const days = Array.from({ length: daysInMonth }, (_, i) => {
        const dayNum = i + 1;
        const dateStr = `${targetYear}-${String(targetMonth).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
        const currentDate = new Date(targetYear, targetMonth - 1, dayNum, 12, 0, 0);
        const isFuture = currentDate.getTime() > todayMidnight.getTime();
        const isToday =
          now.getFullYear() === targetYear &&
          now.getMonth() + 1 === targetMonth &&
          now.getDate() === dayNum;

        const dayPunches = punches.filter(p => {
          const isEmp = p.employeeId === emp.id || p.employeeId === emp.userId;
          if (!isEmp) return false;
          const pDate = new Date(p.createdAt);
          return (
            pDate.getFullYear() === targetYear &&
            pDate.getMonth() + 1 === targetMonth &&
            pDate.getDate() === dayNum
          );
        });

        const dayOfWeek = currentDate.getDay();
        const dayKey = dayNames[dayOfWeek] ?? "mon";
        const rosterVal = empRoster ? String((empRoster as any)[dayKey] || "").trim() : "";
        const isWeekOff =
          rosterVal.toUpperCase() === "WEEK OFF" ||
          rosterVal.toUpperCase() === "OFF" ||
          rosterVal.toUpperCase() === "WO" ||
          (!empRoster && (dayOfWeek === 0 || dayOfWeek === 6)); // Default Saturday & Sunday

        const isLeave = leaves.some(l => {
          const isEmp = l.employeeId === emp.id || l.employeeId === emp.userId;
          if (!isEmp) return false;
          const lStart = new Date(l.startDate);
          const lEnd = new Date(l.endDate);
          const cur = new Date(targetYear, targetMonth - 1, dayNum);
          return (
            cur >= new Date(lStart.getFullYear(), lStart.getMonth(), lStart.getDate()) &&
            cur <= new Date(lEnd.getFullYear(), lEnd.getMonth(), lEnd.getDate())
          );
        });

        const isRegularized = regularizations.some(r => {
          const isEmp = r.employeeId === emp.id || r.employeeId === emp.userId;
          return isEmp && r.date === dateStr;
        });

        let status: "P" | "A" | "L" | "HD" | "WO" | "LV" | "-" = "-";
        let inTime: string | null = null;
        let outTime: string | null = null;
        let workedHours = 0;
        let details = "";

        if (isFuture) {
          status = "-";
          details = "Upcoming";
        } else if (isRegularized) {
          status = "P";
          details = "Regularized Attendance (Present)";
          empPresent++;
          totalMonthPresentDays++;
          if (isToday) todayPresent++;
        } else if (dayPunches.length > 0) {
          const inPunch = dayPunches.find(p => p.type.toLowerCase() === "in");
          const outPunch = [...dayPunches].reverse().find(p => p.type.toLowerCase() === "out");

          if (inPunch) {
            inTime = inPunch.time;
            const inDate = new Date(inPunch.createdAt);
            const inMins = inDate.getHours() * 60 + inDate.getMinutes();

            let shiftStartMins = 9 * 60 + 30; // 09:30 AM
            if (rosterVal) {
              const sh = shifts.find(
                s =>
                  s.code.toLowerCase() === rosterVal.toLowerCase() ||
                  s.name.toLowerCase() === rosterVal.toLowerCase()
              );
              if (sh?.startTime) shiftStartMins = parseTimeToMinutes(sh.startTime);
            }

            const lateMins = inMins - shiftStartMins;
            const isLateOver15 = lateMins > 15;
            const isLateGrace = lateMins > 0 && lateMins <= 15;

            if (outPunch) {
              outTime = outPunch.time;
              const outDate = new Date(outPunch.createdAt);
              workedHours = Math.max(0, (outDate.getTime() - inDate.getTime()) / (1000 * 60 * 60));
              empWorkedHours += workedHours;

              if (workedHours < 8.0) {
                // Worked < 8 hours -> Half Day!
                status = "HD";
                details = `Worked ${workedHours.toFixed(1)}h (< 8h required) -> Half Day`;
                empHalfDay++;
                totalMonthHalfDays++;
                if (isToday) todayHalfDay++;
              } else if (isLateOver15) {
                // Worked >= 8 hours but late > 15m -> Half Day!
                status = "HD";
                details = `Late by ${lateMins}m (> 15m late) -> Half Day`;
                empHalfDay++;
                totalMonthHalfDays++;
                if (isToday) todayHalfDay++;
              } else if (isLateGrace) {
                // Worked >= 8 hours, late 1-15m -> Late
                status = "L";
                details = `Late by ${lateMins}m (Grace period) & worked ${workedHours.toFixed(1)}h -> Late`;
                empLate++;
                totalMonthLateDays++;
                if (isToday) todayLate++;
              } else {
                // On-time and worked >= 8 hours -> Full Day Present!
                status = "P";
                details = `On-time & worked ${workedHours.toFixed(1)}h -> Present (Full Day)`;
                empPresent++;
                totalMonthPresentDays++;
                if (isToday) todayPresent++;
              }
            } else {
              // In punch without out punch
              if (isToday) {
                if (isLateOver15) {
                  status = "HD";
                  details = `Punched in late by ${lateMins}m (> 15m) -> Half Day (In Progress)`;
                  empHalfDay++;
                  totalMonthHalfDays++;
                  todayHalfDay++;
                } else if (isLateGrace) {
                  status = "L";
                  details = `Punched in late by ${lateMins}m -> Late (In Progress)`;
                  empLate++;
                  totalMonthLateDays++;
                  todayLate++;
                } else {
                  status = "P";
                  details = `Punched in on time -> Present (In Progress)`;
                  empPresent++;
                  totalMonthPresentDays++;
                  todayPresent++;
                }
              } else {
                // Past day without out punch
                status = "HD";
                details = `Missing punch out -> Auto Half Day`;
                empHalfDay++;
                totalMonthHalfDays++;
              }
            }
          } else if (outPunch) {
            outTime = outPunch.time;
            status = "HD";
            details = "Only punch-out recorded -> Half Day";
            empHalfDay++;
            totalMonthHalfDays++;
            if (isToday) todayHalfDay++;
          }
        } else {
          // No punches
          if (isLeave) {
            status = "LV";
            details = "Approved Leave";
            empLeave++;
            totalMonthLeaveDays++;
            if (isToday) todayLeave++;
          } else if (isWeekOff) {
            status = "WO";
            details = "Scheduled Week Off";
            empWeekOff++;
            totalMonthWeekOffDays++;
            if (isToday) todayWeekOff++;
          } else if (isToday) {
            const nowMins = now.getHours() * 60 + now.getMinutes();
            if (nowMins < 9 * 60 + 30) {
              status = "-";
              details = "Shift not started yet";
            } else {
              status = "A";
              details = "Absent Today";
              empAbsent++;
              totalMonthAbsentDays++;
              todayAbsent++;
            }
          } else {
            status = "A";
            details = "Absent";
            empAbsent++;
            totalMonthAbsentDays++;
          }
        }

        return {
          day: dayNum,
          date: dateStr,
          status,
          inTime,
          outTime,
          workedHours: Number(workedHours.toFixed(1)),
          details,
        };
      });

      return {
        id: emp.id,
        name: emp.name,
        email: emp.email,
        department: emp.department?.name || undefined,
        designation: emp.designation,
        avatar: emp.avatar,
        counts: {
          present: empPresent,
          late: empLate,
          halfDay: empHalfDay,
          absent: empAbsent,
          weekOff: empWeekOff,
          leave: empLeave,
          totalWorkedHours: Number(empWorkedHours.toFixed(1)),
        },
        days,
      };
    });

    return {
      month: targetMonth,
      year: targetYear,
      daysInMonth,
      summary: {
        totalStaff: employees.length,
        presentToday: todayPresent,
        absentToday: todayAbsent,
        lateToday: todayLate,
        halfDayToday: todayHalfDay,
        leaveToday: todayLeave,
        weekOffToday: todayWeekOff,
        totalPresentDays: totalMonthPresentDays,
        totalLateDays: totalMonthLateDays,
        totalHalfDays: totalMonthHalfDays,
        totalAbsentDays: totalMonthAbsentDays,
        totalWeekOffDays: totalMonthWeekOffDays,
        totalLeaveDays: totalMonthLeaveDays,
      },
      employees: employeeRecords,
    };
  }
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // metres
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // in meters
}
