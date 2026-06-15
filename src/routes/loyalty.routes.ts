import { Router } from "express";
import {
  getUserLoyalty,
  redeemPoints,
} from "../controllers/loyalty.controller";
import { authenticate } from "../middlewares/auth";

const router = Router();

router.get("/users/:userId", authenticate, getUserLoyalty);
router.post("/redeem", authenticate, redeemPoints);

export default router;
