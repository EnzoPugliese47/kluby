import { Router } from "express";
import { getPaymentConfig } from "../controllers/payments.controller";

const router = Router();

router.get("/config", getPaymentConfig);

export default router;
