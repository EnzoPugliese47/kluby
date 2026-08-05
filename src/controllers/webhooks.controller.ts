import type { Request, Response, NextFunction } from "express";
import { sendSuccess } from "../utils/apiResponse";
import { processMercadoPagoWebhook } from "../services/klubyPayment.service";

function extractMpPaymentId(req: Request): string | null {
  const q = req.query;
  if (typeof q["data.id"] === "string" && q["data.id"].trim()) {
    return q["data.id"].trim();
  }
  if (typeof q["id"] === "string" && q["topic"] === "payment") {
    return q["id"].trim();
  }
  const body = req.body as { data?: { id?: string | number }; type?: string };
  if (body?.type === "payment" && body.data?.id != null) {
    return String(body.data.id);
  }
  return null;
}

/** POST/GET /api/webhooks/mercadopago — notificaciones IPN de Mercado Pago. */
export const mercadoPagoWebhook = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const mpPaymentId = extractMpPaymentId(req);
    if (mpPaymentId) {
      await processMercadoPagoWebhook(mpPaymentId);
    }
    sendSuccess(res, { received: true });
  } catch (error) {
    next(error);
  }
};
