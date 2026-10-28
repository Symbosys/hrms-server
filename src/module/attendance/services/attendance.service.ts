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

export class AttendanceService {
  static async getPunches(employeeId: string, organizationId?: string, requestingUser?: any) {
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
