import { env } from "../config/env";

export function isMercadoPagoEnabled(): boolean {
  return env.mpAccessToken.trim().length > 0;
}

export function isMercadoPagoSandbox(): boolean {
  return env.mpSandbox;
}

function mpHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${env.mpAccessToken}`,
    "Content-Type": "application/json",
  };
}

/** Email del comprador de prueba vía API de MP (User ID del panel). */
async function fetchMpTestUserEmail(userId: string): Promise<string | null> {
  const res = await fetch(`https://api.mercadopago.com/users/${encodeURIComponent(userId)}`, {
    headers: mpHeaders(),
  });
  const data = (await res.json()) as { email?: string; message?: string };
  if (!res.ok || !data.email) return null;
  return data.email.trim();
}

/** Resuelve el email del pagador para sandbox (cuenta de prueba, no email real de Kluby). */
export async function resolveMercadoPagoPayerEmail(fallbackEmail: string): Promise<string> {
  if (!isMercadoPagoSandbox()) return fallbackEmail;

  if (env.mpTestPayerEmail) return env.mpTestPayerEmail;

  if (env.mpTestPayerUserId) {
    const fromApi = await fetchMpTestUserEmail(env.mpTestPayerUserId);
    if (fromApi) return fromApi;
  }

  throw new Error(
    "Configurá MP_TEST_PAYER_EMAIL o MP_TEST_PAYER_USER_ID (3594961386) con el comprador de prueba de Mercado Pago"
  );
}

export function mercadoPagoSandboxReady(): boolean {
  return (
    !isMercadoPagoSandbox()
    || env.mpTestPayerEmail.length > 0
    || env.mpTestPayerUserId.length > 0
  );
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
  payerEmail: string;
};

export async function createMercadoPagoCheckout(
  input: MpCheckoutInput
): Promise<MpCheckoutResult> {
  const unitPrice = Number(input.amount.toFixed(2));
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
    throw new Error("Monto invalido para Mercado Pago");
  }

  const payerEmail = await resolveMercadoPagoPayerEmail(input.payerEmail);

  const body: Record<string, unknown> = {
    items: [
      {
        title: input.title.slice(0, 256),
        quantity: 1,
        unit_price: unitPrice,
        currency_id: "ARS",
      },
    ],
    payer: { email: payerEmail.slice(0, 254) },
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

  if (isMercadoPagoSandbox()) {
    body.payment_methods = {
      excluded_payment_types: [{ id: "ticket" }, { id: "atm" }, { id: "bank_transfer" }],
      installments: 1,
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

  const checkoutUrl = isMercadoPagoSandbox()
    ? data.sandbox_init_point || data.init_point
    : data.init_point || data.sandbox_init_point;

  if (!data.id || !checkoutUrl) {
    throw new Error("Mercado Pago no devolvio URL de checkout");
  }

  return { preferenceId: data.id, checkoutUrl, payerEmail };
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
