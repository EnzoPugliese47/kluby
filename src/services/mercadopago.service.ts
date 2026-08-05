import { env } from "../config/env";

export function isMercadoPagoEnabled(): boolean {
  return env.mpAccessToken.trim().length > 0;
}

export function isMercadoPagoSandbox(): boolean {
  return env.mpSandbox;
}

/** Email del pagador en la preferencia MP (sandbox exige cuenta de prueba). */
export function resolveMercadoPagoPayerEmail(fallbackEmail: string): string {
  if (isMercadoPagoSandbox() && env.mpTestPayerEmail) {
    return env.mpTestPayerEmail;
  }
  return fallbackEmail;
}

export function mercadoPagoSandboxReady(): boolean {
  return !isMercadoPagoSandbox() || env.mpTestPayerEmail.length > 0;
}

function mpHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${env.mpAccessToken}`,
    "Content-Type": "application/json",
  };
}

export type MpPreferenceItem = {
  title: string;
  quantity: number;
  unit_price: number;
  currency_id?: string;
};

export type MpCheckoutInput = {
  klubyPaymentId: string;
  title: string;
  amount: number;
  payerEmail: string;
  successUrl: string;
  failureUrl: string;
  pendingUrl: string;
  metadata?: Record<string, string>;
};

export type MpCheckoutResult = {
  preferenceId: string;
  checkoutUrl: string;
};

export async function createMercadoPagoCheckout(
  input: MpCheckoutInput
): Promise<MpCheckoutResult> {
  const unitPrice = Number(input.amount.toFixed(2));
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
    throw new Error("Monto invalido para Mercado Pago");
  }

  if (isMercadoPagoSandbox() && !env.mpTestPayerEmail) {
    throw new Error(
      "Configurá MP_TEST_PAYER_EMAIL con el email del comprador de prueba de Mercado Pago (panel → Cuentas de prueba → Comprador)"
    );
  }

  const payerEmail = resolveMercadoPagoPayerEmail(input.payerEmail);
  const payer: Record<string, unknown> = { email: payerEmail.slice(0, 254) };
  if (isMercadoPagoSandbox()) {
    payer.name = "APRO";
    payer.identification = { type: "DNI", number: "12345678" };
  }

  const body: Record<string, unknown> = {
    items: [
      {
        title: input.title.slice(0, 256),
        quantity: 1,
        unit_price: unitPrice,
        currency_id: "ARS",
      },
    ],
    payer,
    back_urls: {
      success: input.successUrl,
      failure: input.failureUrl,
      pending: input.pendingUrl,
    },
    auto_return: "approved" as const,
    external_reference: `kluby:${input.klubyPaymentId}`,
    notification_url: `${env.publicAppUrl.replace(/\/$/, "")}/api/webhooks/mercadopago`,
    metadata: input.metadata ?? {},
  };

  // En sandbox, Pago Fácil / Rapipago suelen dejar el botón "Pagar" deshabilitado.
  // Forzamos tarjeta (y cuenta MP) para la demo con tarjetas de prueba.
  if (isMercadoPagoSandbox()) {
    body.payment_methods = {
      excluded_payment_types: [{ id: "ticket" }, { id: "atm" }, { id: "bank_transfer" }],
    };
  }

  const res = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: mpHeaders(),
    body: JSON.stringify(body),
  });

  const data = (await res.json()) as {
    id?: string;
    init_point?: string;
    sandbox_init_point?: string;
    message?: string;
    error?: string;
  };

  if (!res.ok) {
    const detail = data.message || data.error || res.statusText;
    throw new Error(`Mercado Pago: ${detail}`);
  }

  // En sandbox priorizamos sandbox_init_point: evita mezclar cookies de tu cuenta real
  // en mercadopago.com.ar con el flujo de prueba.
  const checkoutUrl = isMercadoPagoSandbox()
    ? data.sandbox_init_point || data.init_point
    : data.init_point || data.sandbox_init_point;

  if (!data.id || !checkoutUrl) {
    throw new Error("Mercado Pago no devolvio URL de checkout");
  }

  return { preferenceId: data.id, checkoutUrl };
}

export type MpPaymentInfo = {
  id: string;
  status: string;
  external_reference: string | null;
  transaction_amount: number;
  metadata?: Record<string, unknown>;
};

export async function fetchMercadoPagoPayment(
  mpPaymentId: string
): Promise<MpPaymentInfo> {
  const res = await fetch(`https://api.mercadopago.com/v1/payments/${mpPaymentId}`, {
    headers: mpHeaders(),
  });

  const data = (await res.json()) as MpPaymentInfo & { message?: string; error?: string };
  if (!res.ok) {
    const detail = data.message || data.error || res.statusText;
    throw new Error(`Mercado Pago payment ${mpPaymentId}: ${detail}`);
  }

  return data;
}

export function parseKlubyPaymentRef(externalRef: string | null | undefined): string | null {
  if (!externalRef) return null;
  const m = /^kluby:([0-9a-f-]{36})$/i.exec(externalRef.trim());
  return m?.[1] ?? null;
}
