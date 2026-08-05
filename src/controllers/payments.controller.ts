import type { Request, Response, NextFunction } from "express";
import { sendSuccess } from "../utils/apiResponse";
import {
  isMercadoPagoEnabled,
  isMercadoPagoSandbox,
} from "../services/mercadopago.service";

/** GET /api/payments/config — estado de la pasarela para el frontend. */
export const getPaymentConfig = (_req: Request, res: Response): void => {
  sendSuccess(res, {
    mercadoPagoEnabled: isMercadoPagoEnabled(),
    sandbox: isMercadoPagoSandbox(),
    defaultProvider: isMercadoPagoEnabled() ? "mercadopago" : "demo",
  });
};
