import { Router } from "express";
import {
  assignTableToUser,
  getEventAvailability,
  releaseTable,
  updateEvent,
} from "../controllers/events.controller";
import { authenticate, authorize } from "../middlewares/auth";

const router = Router();

const staffOrAdmin = [
  authenticate,
  authorize("STAFF", "CLUB_ADMIN", "SUPER_ADMIN"),
];

router.get("/:eventId/availability", getEventAvailability);

// Gestion del evento (staff/admin).
router.patch("/:eventId", ...staffOrAdmin, updateEvent);
router.post("/:eventId/assign", ...staffOrAdmin, assignTableToUser);
router.post("/:eventId/release", ...staffOrAdmin, releaseTable);

export default router;
