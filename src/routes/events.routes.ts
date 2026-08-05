import { Router } from "express";
import {
  assignTableToUser,
  deleteEvent,
  getEventAvailability,
  listExploreEvents,
  releaseTable,
  updateEvent,
} from "../controllers/events.controller";
import {
  createProductForEvent,
  listProductsByEvent,
} from "../controllers/products.controller";
import {
  createEventInvite,
  listEventInviteGuests,
  listEventInvites,
} from "../controllers/invites.controller";
import { bulkCreateTablesForEvent, deleteAllEventTables } from "../controllers/tables.controller";
import {
  createEventFloor,
  deleteEventFloor,
  listEventFloors,
  updateEventFloor,
} from "../controllers/floors.controller";
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

router.get("/explore", listExploreEvents);
router.get("/:eventId/availability", getEventAvailability);
router.get("/:eventId/products", listProductsByEvent);

// Gestion del evento (staff/admin).
router.patch("/:eventId", ...adminOnly, updateEvent);
router.delete("/:eventId", ...adminOnly, deleteEvent);
router.post("/:eventId/assign", ...adminOnly, assignTableToUser);
router.get("/:eventId/floors", listEventFloors);
router.post("/:eventId/floors", ...adminOnly, createEventFloor);
router.patch("/:eventId/floors/:floorId", ...adminOnly, updateEventFloor);
router.delete("/:eventId/floors/:floorId", ...adminOnly, deleteEventFloor);
router.post("/:eventId/tables/bulk", ...adminOnly, bulkCreateTablesForEvent);
router.delete("/:eventId/tables", ...adminOnly, deleteAllEventTables);
router.post("/:eventId/release", ...adminOnly, releaseTable);
router.post("/:eventId/products", ...adminOnly, createProductForEvent);
router.post("/:eventId/invites", ...promoOrAdmin, createEventInvite);
router.get("/:eventId/invites", ...promoOrAdmin, listEventInvites);
router.get("/:eventId/invite-guests", ...promoOrAdmin, listEventInviteGuests);

export default router;
