import { Router } from "express";
import {
  getClubBalance,
  getClubLoyaltyStats,
  getLoyaltyConfig,
  getUserLoyalty,
  redeemPoints,
} from "../controllers/loyalty.controller";
import { authenticate, authorize } from "../middlewares/auth";

const router = Router();

router.get("/config", getLoyaltyConfig);
router.get("/clubs/:clubId/balance", authenticate, getClubBalance);
router.get(
  "/clubs/:clubId/stats",
  authenticate,
  authorize("CLUB_ADMIN", "STAFF", "SUPER_ADMIN"),
  getClubLoyaltyStats
);
router.get("/users/:userId", authenticate, getUserLoyalty);
router.post("/redeem", authenticate, redeemPoints);

export default router;
