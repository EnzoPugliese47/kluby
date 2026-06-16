import { Router } from "express";
import {
  assignTableToUser,
  deleteEvent,
  getEventAvailability,
  releaseTable,
  updateEvent,
} from "../controllers/events.controller";
import {
  createProductForEvent,
  listProductsByEvent,
} from "../controllers/products.controller";
import { authenticate, authorize } from "../middlewares/auth";

const router = Router();

const staffOrAdmin = [
  authenticate,
  authorize("STAFF", "CLUB_ADMIN", "SUPER_ADMIN"),
];

router.get("/:eventId/availability", getEventAvailability);
router.get("/:eventId/products", listProductsByEvent);

// Gestion del evento (staff/admin).
router.patch("/:eventId", ...staffOrAdmin, updateEvent);
router.delete("/:eventId", ...staffOrAdmin, deleteEvent);
router.post("/:eventId/assign", ...staffOrAdmin, assignTableToUser);
router.post("/:eventId/release", ...staffOrAdmin, releaseTable);
router.post("/:eventId/products", ...staffOrAdmin, createProductForEvent);

export default router;
