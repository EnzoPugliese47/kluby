import { Router } from "express";
import { mercadoPagoWebhook } from "../controllers/webhooks.controller";

const router = Router();

router.post("/mercadopago", mercadoPagoWebhook);
router.get("/mercadopago", mercadoPagoWebhook);

export default router;
