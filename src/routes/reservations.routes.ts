import { Router } from "express";
import {
  cancelReservation,
  checkInReservation,
  checkoutReservation,
  createReservation,
  getCancelPreview,
  getRefundPolicy,
  getReservationByCode,
  getReservationById,
  patchPendingReservation,
  releaseReservationHold,
  payReservation,
} from "../controllers/reservations.controller";
import {
  listGuests,
  listOpenTables,
  openTable,
  requestToJoin,
} from "../controllers/openTable.controller";
import {
  createOrder,
  listOrdersByReservation,
} from "../controllers/orders.controller";
import {
  getChatMessages,
  postChatMessage,
} from "../controllers/chat.controller";
import { authenticate, authorize } from "../middlewares/auth";

const router = Router();

// Muro de mesas abiertas (publico). Antes de "/:id" para no colisionar.
router.get("/open", listOpenTables);
router.get("/refund-policy", getRefundPolicy);

router.post("/", authenticate, createReservation);
// Operacion de puerta: escaneo QR, check-in y check-out.
const doorOnly = [authenticate, authorize("PUERTA", "CLUB_ADMIN", "SUPER_ADMIN")];
router.get("/by-code/:code", ...doorOnly, getReservationByCode);
router.get("/:id/cancel-preview", authenticate, getCancelPreview);
router.get("/:id", authenticate, getReservationById);
router.patch("/:id/pending", authenticate, patchPendingReservation);
router.post("/:id/release-hold", authenticate, releaseReservationHold);
router.post("/:id/pay", authenticate, payReservation);
router.post("/:id/cancel", authenticate, cancelReservation);
router.post("/:id/check-in", ...doorOnly, checkInReservation);
router.post("/:id/checkout", ...doorOnly, checkoutReservation);

// Modulo Social / Mesa Abierta (Split Bill).
router.post("/:id/open", authenticate, openTable);
router.post("/:id/guests", authenticate, requestToJoin);
router.get("/:id/guests", authenticate, listGuests);

// Pedidos de productos asociados a la reserva.
router.post("/:id/orders", authenticate, createOrder);
router.get("/:id/orders", authenticate, listOrdersByReservation);

// Chat de mesa (RN12).
router.post("/:id/chat", authenticate, postChatMessage);
router.get("/:id/chat", authenticate, getChatMessages);

export default router;
