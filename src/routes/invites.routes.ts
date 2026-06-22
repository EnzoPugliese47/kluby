import { Router } from "express";
import {
  createClubJoinInvite,
  deactivateClubJoinInvite,
  listClubJoinInvites,
  listMyEventInvites,
  listStaffClubEvents,
  previewEventInvite,
  redeemClubJoinInvite,
  redeemEventInvite,
} from "../controllers/invites.controller";
import { authenticate, authorize } from "../middlewares/auth";

const router = Router();

router.get("/event/preview", previewEventInvite);

router.post(
  "/club/redeem",
  authenticate,
  authorize("CLIENT", "STAFF", "PUERTA"),
  redeemClubJoinInvite
);

router.post(
  "/event/redeem",
  authenticate,
  authorize("CLIENT"),
  redeemEventInvite
);

router.get(
  "/my-events",
  authenticate,
  authorize("CLIENT"),
  listMyEventInvites
);

export default router;
