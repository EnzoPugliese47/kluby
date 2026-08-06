import {
  Prisma,
  LoyaltyTxType,
  PaymentOption,
  PaymentStatus,
  PaymentType,
  ReservationStatus,
  GuestStatus,
} from "../generated/prisma/client";
import { prisma } from "../lib/prisma";
import { env } from "../config/env";
import { AppError } from "../utils/appError";
import {
  computeDiscountValue,
  computeBalances,
  LOYALTY_DESC,
  validateRedeemPoints,
} from "../utils/loyalty";
import {
  createMercadoPagoCheckout,
  fetchMercadoPagoPayment,
  isMercadoPagoEnabled,
  parseKlubyPaymentRef,
} from "./mercadopago.service";
import { computeTableSaleCommission } from "../utils/clubPlan";

const reservationInclude = {
  table: true,
  event: true,
  club: { select: { id: true, name: true, plan: true } },
  host: { select: { id: true, fullName: true, email: true } },
  guests: {
    include: { user: { select: { id: true, fullName: true } } },
  },
  payments: true,
  orders: {
    orderBy: { createdAt: "desc" as const },
    include: {
      items: { include: { product: { select: { id: true, name: true, category: true } } } },
    },
  },
} satisfies Prisma.ReservationInclude;

const isTablePrepaidByHost = (paymentOption: PaymentOption): boolean =>
  paymentOption === PaymentOption.FULL_PAYMENT;

export type PayAmountBreakdown = {
  amount: Prisma.Decimal;
  paymentType: PaymentType;
  pointsRedeemed: number;
  loyaltyDiscount: Prisma.Decimal;
};

export async function computeReservationPayAmount(
  tx: Prisma.TransactionClient,
  reservationId: string,
  hostId: string,
  loyaltyPointsToRedeem: number
): Promise<{
  reservation: NonNullable<Awaited<ReturnType<typeof tx.reservation.findUnique>>>;
  breakdown: PayAmountBreakdown;
}> {
  const current = await tx.reservation.findUnique({ where: { id: reservationId } });
  if (current === null) throw new AppError("Reserva no encontrada", 404);
  if (current.hostId !== hostId) {
    throw new AppError("Solo el anfitrion puede pagar esta reserva", 403);
  }
  if (current.status !== ReservationStatus.PENDING_PAYMENT) {
    throw new AppError(
      `La reserva no esta pendiente de pago (estado actual: ${current.status})`,
      400
    );
  }
  if (current.expiresAt.getTime() <= Date.now()) {
    await tx.reservation.update({
      where: { id: reservationId },
      data: { status: ReservationStatus.EXPIRED },
    });
    throw new AppError(
      "El bloqueo de la mesa expiro, la reserva fue liberada (RN05)",
      410
    );
  }

  const club = await tx.club.findUnique({ where: { id: current.clubId } });
  if (club === null) throw new AppError("Boliche no encontrado", 404);

  const isFull = current.paymentOption === PaymentOption.FULL_PAYMENT;
  const baseAmount = isFull ? current.totalAmount : current.depositAmount;

  let loyaltyDiscount = new Prisma.Decimal(0);
  let pointsRedeemed = 0;

  if (loyaltyPointsToRedeem > 0) {
    const txns = await tx.loyaltyTransaction.findMany({
      where: { userId: current.hostId, clubId: current.clubId },
      select: { clubId: true, type: true, points: true },
    });
    const balance = computeBalances(txns).get(current.clubId) ?? 0;
    validateRedeemPoints(loyaltyPointsToRedeem, balance, baseAmount, club.pointValue);
    loyaltyDiscount = computeDiscountValue(loyaltyPointsToRedeem, club.pointValue);
    pointsRedeemed = loyaltyPointsToRedeem;
  }

  const amount = Prisma.Decimal.max(baseAmount.sub(loyaltyDiscount), new Prisma.Decimal(0));
  const paymentType = isFull ? PaymentType.FULL : PaymentType.DEPOSIT;

  return {
    reservation: current,
    breakdown: { amount, paymentType, pointsRedeemed, loyaltyDiscount },
  };
}

const TABLE_SALE_TYPES = new Set<PaymentType>([
  PaymentType.DEPOSIT,
  PaymentType.FULL,
  PaymentType.GUEST_SHARE,
]);

async function commissionFieldsForReservation(
  tx: Prisma.TransactionClient,
  reservationId: string,
  grossAmount: Prisma.Decimal,
  paymentType: PaymentType
) {
  if (!TABLE_SALE_TYPES.has(paymentType) || grossAmount.lte(0)) {
    return {};
  }
  const reservation = await tx.reservation.findUnique({
    where: { id: reservationId },
    select: { club: { select: { plan: true } } },
  });
  if (!reservation?.club) return {};
  return computeTableSaleCommission(grossAmount, reservation.club.plan);
}

export async function confirmReservationPaymentInTx(
  tx: Prisma.TransactionClient,
  reservationId: string,
  hostId: string,
  breakdown: PayAmountBreakdown,
  provider: string | null,
  externalRef: string | null,
  existingPaymentId?: string
) {
  const { amount, paymentType, pointsRedeemed, loyaltyDiscount } = breakdown;

  if (pointsRedeemed > 0) {
    const current = await tx.reservation.findUnique({ where: { id: reservationId } });
    if (!current) throw new AppError("Reserva no encontrada", 404);
    await tx.loyaltyTransaction.create({
      data: {
        userId: hostId,
        clubId: current.clubId,
        reservationId,
        type: LoyaltyTxType.REDEEMED,
        points: pointsRedeemed,
        description: LOYALTY_DESC.REDEEM,
      },
    });
  }

  if (amount.greaterThan(0)) {
    const commission = await commissionFieldsForReservation(
      tx,
      reservationId,
      amount,
      paymentType
    );
    if (existingPaymentId) {
      await tx.payment.update({
        where: { id: existingPaymentId },
        data: {
          status: PaymentStatus.APPROVED,
          provider: provider ?? "mercadopago",
          externalRef,
          ...commission,
        },
      });
    } else {
      await tx.payment.create({
        data: {
          reservationId,
          userId: hostId,
          type: paymentType,
          amount,
          status: PaymentStatus.APPROVED,
          provider,
          externalRef,
          ...commission,
        },
      });
    }
  } else if (existingPaymentId) {
    await tx.payment.update({
      where: { id: existingPaymentId },
      data: { status: PaymentStatus.APPROVED, provider, externalRef },
    });
  }

  return tx.reservation.update({
    where: { id: reservationId },
    data: {
      status: ReservationStatus.CONFIRMED,
      confirmedAt: new Date(),
      amountPaid: amount,
      loyaltyPointsRedeemed: pointsRedeemed,
      loyaltyDiscount,
    },
    include: reservationInclude,
  });
}

export async function startReservationMercadoPagoCheckout(
  reservationId: string,
  hostId: string,
  hostEmail: string,
  loyaltyPointsToRedeem: number
) {
  const prep = await prisma.$transaction(async (tx) => {
    const { reservation, breakdown } = await computeReservationPayAmount(
      tx,
      reservationId,
      hostId,
      loyaltyPointsToRedeem
    );

    if (breakdown.amount.lte(0)) {
      const confirmed = await confirmReservationPaymentInTx(
        tx,
        reservationId,
        hostId,
        breakdown,
        "demo",
        null
      );
      return { kind: "confirmed" as const, reservation: confirmed };
    }

    const existingPending = await tx.payment.findFirst({
      where: {
        reservationId,
        userId: hostId,
        status: PaymentStatus.PENDING,
        provider: "mercadopago",
      },
      orderBy: { createdAt: "desc" },
    });

    const payment = existingPending
      ?? await tx.payment.create({
        data: {
          reservationId,
          userId: hostId,
          type: breakdown.paymentType,
          amount: breakdown.amount,
          status: PaymentStatus.PENDING,
          provider: "mercadopago",
        },
      });

    return {
      kind: "checkout" as const,
      paymentId: payment.id,
      reservation,
      breakdown,
    };
  });

  if (prep.kind === "confirmed") {
    return { mode: "confirmed" as const, reservation: prep.reservation };
  }

  const base = env.publicAppUrl.replace(/\/$/, "");
  const appReturn = (extra: Record<string, string>) => {
    const p = new URLSearchParams({
      mp: "return",
      kind: "reservation",
      id: reservationId,
      ...extra,
    });
    return `${base}/app.html?${p.toString()}`;
  };

  try {
    const checkout = await createMercadoPagoCheckout({
      klubyPaymentId: prep.paymentId,
      title: `Kluby · ${prep.reservation.paymentOption === PaymentOption.FULL_PAYMENT ? "Pago total" : "Seña"} mesa`,
      amount: Number(prep.breakdown.amount),
      payerEmail: hostEmail,
      successUrl: appReturn({ status: "ok" }),
      failureUrl: appReturn({ status: "fail" }),
      pendingUrl: appReturn({ status: "pending" }),
      metadata: {
        kluby_payment_id: prep.paymentId,
        loyalty_points: String(loyaltyPointsToRedeem),
      },
    });

    await prisma.payment.update({
      where: { id: prep.paymentId },
      data: { externalRef: checkout.preferenceId },
    });

    return {
      mode: "checkout" as const,
      checkoutUrl: checkout.checkoutUrl,
      paymentId: prep.paymentId,
      reservationId,
    };
  } catch (error) {
    await prisma.payment.deleteMany({
      where: { id: prep.paymentId, status: PaymentStatus.PENDING },
    }).catch(() => {});
    throw error;
  }
}

export async function startGuestMercadoPagoCheckout(
  guestId: string,
  userId: string,
  userEmail: string
) {
  const prep = await prisma.$transaction(async (tx) => {
    const guest = await tx.reservationGuest.findUnique({ where: { id: guestId } });
    if (guest === null) throw new AppError("Postulacion no encontrada", 404);
    if (guest.userId !== userId) {
      throw new AppError("Solo el invitado puede pagar su parte", 403);
    }
    if (guest.status !== GuestStatus.ACCEPTED_PENDING_PAYMENT) {
      throw new AppError(
        `El invitado debe estar aceptado y pendiente de pago (estado: ${guest.status})`,
        400
      );
    }

    const reservation = await tx.reservation.findUnique({
      where: { id: guest.reservationId },
    });
    if (reservation === null) throw new AppError("Reserva no encontrada", 404);

    if (isTablePrepaidByHost(reservation.paymentOption)) {
      const confirmedGuest = await tx.reservationGuest.update({
        where: { id: guestId },
        data: { status: GuestStatus.CONFIRMED, shareAmount: new Prisma.Decimal(0) },
      });
      return { kind: "confirmed" as const, guest: confirmedGuest, reservation };
    }

    const amount = guest.shareAmount;
    if (amount.lte(0)) {
      const confirmedGuest = await tx.reservationGuest.update({
        where: { id: guestId },
        data: { status: GuestStatus.CONFIRMED },
      });
      return { kind: "confirmed" as const, guest: confirmedGuest, reservation };
    }

    const payment = await tx.payment.create({
      data: {
        reservationId: guest.reservationId,
        guestId: guest.id,
        userId: guest.userId,
        type: PaymentType.GUEST_SHARE,
        amount,
        status: PaymentStatus.PENDING,
        provider: "mercadopago",
      },
    });

    return {
      kind: "checkout" as const,
      paymentId: payment.id,
      guestId,
      reservationId: guest.reservationId,
      amount,
    };
  });

  if (prep.kind === "confirmed") {
    return { mode: "confirmed" as const, guest: prep.guest, reservation: prep.reservation };
  }

  const base = env.publicAppUrl.replace(/\/$/, "");
  const appReturn = (extra: Record<string, string>) => {
    const p = new URLSearchParams({
      mp: "return",
      kind: "guest",
      id: prep.reservationId,
      guestId: prep.guestId,
      ...extra,
    });
    return `${base}/app.html?${p.toString()}`;
  };

  const checkout = await createMercadoPagoCheckout({
    klubyPaymentId: prep.paymentId,
    title: "Kluby · Tu parte en la mesa",
    amount: Number(prep.amount),
    payerEmail: userEmail,
    successUrl: appReturn({ status: "ok" }),
    failureUrl: appReturn({ status: "fail" }),
    pendingUrl: appReturn({ status: "pending" }),
    metadata: { kluby_payment_id: prep.paymentId },
  });

  await prisma.payment.update({
    where: { id: prep.paymentId },
    data: { externalRef: checkout.preferenceId },
  });

  return {
    mode: "checkout" as const,
    checkoutUrl: checkout.checkoutUrl,
    paymentId: prep.paymentId,
    guestId: prep.guestId,
    reservationId: prep.reservationId,
  };
}

async function confirmGuestPaymentInTx(
  tx: Prisma.TransactionClient,
  paymentId: string,
  mpPaymentId: string
) {
  const payment = await tx.payment.findUnique({ where: { id: paymentId } });
  if (!payment) throw new AppError("Pago no encontrado", 404);
  if (payment.status === PaymentStatus.APPROVED) return payment;
  if (!payment.guestId) throw new AppError("Pago no es de invitado", 400);

  const commission = await commissionFieldsForReservation(
    tx,
    payment.reservationId,
    payment.amount,
    PaymentType.GUEST_SHARE
  );

  await tx.payment.update({
    where: { id: paymentId },
    data: {
      status: PaymentStatus.APPROVED,
      provider: "mercadopago",
      externalRef: mpPaymentId,
      ...commission,
    },
  });

  await tx.reservationGuest.update({
    where: { id: payment.guestId },
    data: { status: GuestStatus.CONFIRMED },
  });

  await tx.reservation.update({
    where: { id: payment.reservationId },
    data: { amountPaid: { increment: payment.amount } },
  });

  return payment;
}

export async function processMercadoPagoWebhook(mpPaymentId: string): Promise<void> {
  if (!isMercadoPagoEnabled()) return;

  const mpPayment = await fetchMercadoPagoPayment(mpPaymentId);
  if (mpPayment.status !== "approved") return;

  const klubyPaymentId =
    parseKlubyPaymentRef(mpPayment.external_reference) ||
    (typeof mpPayment.metadata?.["kluby_payment_id"] === "string"
      ? mpPayment.metadata["kluby_payment_id"]
      : null);

  if (!klubyPaymentId) return;

  const existing = await prisma.payment.findUnique({ where: { id: klubyPaymentId } });
  if (!existing || existing.status === PaymentStatus.APPROVED) return;

  const mpAmount = Number(mpPayment.transaction_amount);
  const expected = Number(existing.amount);
  if (Math.abs(mpAmount - expected) > 0.02) {
    throw new AppError("Monto de Mercado Pago no coincide con el pago Kluby", 400);
  }

  await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({ where: { id: klubyPaymentId } });
    if (!payment || payment.status === PaymentStatus.APPROVED) return;

    if (payment.guestId) {
      await confirmGuestPaymentInTx(tx, klubyPaymentId, mpPaymentId);
      return;
    }

    const loyaltyRaw = mpPayment.metadata?.["loyalty_points"];
    const loyaltyPointsToRedeem =
      typeof loyaltyRaw === "string" ? Math.max(0, Math.floor(Number(loyaltyRaw))) : 0;

    const { breakdown } = await computeReservationPayAmount(
      tx,
      payment.reservationId,
      payment.userId,
      loyaltyPointsToRedeem
    );

    await confirmReservationPaymentInTx(
      tx,
      payment.reservationId,
      payment.userId,
      breakdown,
      "mercadopago",
      mpPaymentId,
      klubyPaymentId
    );
  });
}

export { reservationInclude, isMercadoPagoEnabled };
