import { Router } from "express";
import {
  payOrder,
  updateOrderStatus,
} from "../controllers/orders.controller";
import { authenticate, authorize } from "../middlewares/auth";

const router = Router();

router.post("/:orderId/pay", authenticate, payOrder);
router.patch(
  "/:orderId/status",
  authenticate,
  authorize("CLUB_ADMIN", "SUPER_ADMIN"),
  updateOrderStatus
);

export default router;
