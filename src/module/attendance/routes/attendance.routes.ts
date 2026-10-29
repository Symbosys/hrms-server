import { Router } from "express";
import { protect, hasPermission } from "../../../middlewares/auth.middleware.ts";
import {
  getPunches,
  createPunch,
  getRegularizations,
  applyRegularization,
  updateRegularization,
  getGeofences,
  createGeofence,
  deleteGeofence,
  getRosters,
  saveRosters,
  getShiftTimings,
  createShiftTiming,
  deleteShiftTiming,
  getMusterRoll,
} from "../controllers/attendance.controller.ts";

const router = Router();

// Protect all routes
router.use(protect);

router.get("/muster-roll", hasPermission("VIEW_MUSTER_ROLL", "VIEW_ATTENDANCE"), getMusterRoll);
router.get("/punches/:employeeId", hasPermission("VIEW_GPS_SELFIE_PUNCH", "VIEW_ATTENDANCE"), getPunches);
router.post("/punches", hasPermission("CREATE_GPS_SELFIE_PUNCH", "CREATE_ATTENDANCE"), createPunch);
router.get("/regularizations", hasPermission("VIEW_ATTENDANCE_REGULARIZATION", "VIEW_ATTENDANCE"), getRegularizations);
router.post("/regularizations", hasPermission("CREATE_ATTENDANCE_REGULARIZATION", "CREATE_ATTENDANCE"), applyRegularization);
router.patch("/regularizations/:id", hasPermission("UPDATE_ATTENDANCE_REGULARIZATION", "UPDATE_ATTENDANCE"), updateRegularization);
router.get("/geofences", hasPermission("VIEW_ATTENDANCE"), getGeofences);
router.post("/geofences", hasPermission("UPDATE_ATTENDANCE"), createGeofence);
router.delete("/geofences/:id", hasPermission("DELETE_ATTENDANCE"), deleteGeofence);
router.get("/rosters", hasPermission("VIEW_SHIFT_ROSTER", "VIEW_ATTENDANCE"), getRosters);
router.post("/rosters", hasPermission("UPDATE_SHIFT_ROSTER", "UPDATE_ATTENDANCE"), saveRosters);
router.get("/shift-timings", getShiftTimings);
router.post("/shift-timings", createShiftTiming);
router.delete("/shift-timings/:id", deleteShiftTiming);

export default router;
