import type { Request, Response, NextFunction } from "express";
import { sendSuccess } from "../utils/apiResponse";
import {
  isMercadoPagoEnabled,
  isMercadoPagoSandbox,
  mercadoPagoSandboxReady,
} from "../services/mercadopago.service";

/** GET /api/payments/config — estado de la pasarela para el frontend. */
export const getPaymentConfig = (_req: Request, res: Response): void => {
  const sandbox = isMercadoPagoSandbox();
  sendSuccess(res, {
    mercadoPagoEnabled: isMercadoPagoEnabled(),
    sandbox,
    sandboxReady: mercadoPagoSandboxReady(),
    defaultProvider: isMercadoPagoEnabled() && !sandbox ? "mercadopago" : "demo",
  });
};
