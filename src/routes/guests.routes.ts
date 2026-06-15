import { Router } from "express";
import {
  acceptGuest,
  payGuestShare,
  rejectGuest,
} from "../controllers/openTable.controller";
import { authenticate } from "../middlewares/auth";

const router = Router();

router.post("/:guestId/accept", authenticate, acceptGuest);
router.post("/:guestId/reject", authenticate, rejectGuest);
router.post("/:guestId/pay", authenticate, payGuestShare);

export default router;
