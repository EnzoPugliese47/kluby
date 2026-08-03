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
import {
  createEventInvite,
  listEventInvites,
} from "../controllers/invites.controller";
import { bulkCreateTablesForEvent, deleteAllEventTables } from "../controllers/tables.controller";
import { authenticate, authorize } from "../middlewares/auth";

const router = Router();

const adminOnly = [
  authenticate,
  authorize("CLUB_ADMIN", "SUPER_ADMIN"),
];

const promoOrAdmin = [
  authenticate,
  authorize("STAFF", "CLUB_ADMIN", "SUPER_ADMIN"),
];

router.get("/:eventId/availability", getEventAvailability);
router.get("/:eventId/products", listProductsByEvent);

// Gestion del evento (staff/admin).
router.patch("/:eventId", ...adminOnly, updateEvent);
router.delete("/:eventId", ...adminOnly, deleteEvent);
router.post("/:eventId/assign", ...adminOnly, assignTableToUser);
router.post("/:eventId/tables/bulk", ...adminOnly, bulkCreateTablesForEvent);
router.delete("/:eventId/tables", ...adminOnly, deleteAllEventTables);
router.post("/:eventId/release", ...adminOnly, releaseTable);
router.post("/:eventId/products", ...adminOnly, createProductForEvent);
router.post("/:eventId/invites", ...promoOrAdmin, createEventInvite);
router.get("/:eventId/invites", ...promoOrAdmin, listEventInvites);

export default router;
