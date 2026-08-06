import {
  GuestStatus,
  LoyaltyTxType,
  OrderStatus,
  OrderType,
  PaymentStatus,
  PaymentType,
  Prisma,
  ReservationMode,
  ReservationStatus,
  UserRole,
} from "../generated/prisma/client";
import { prisma } from "../lib/prisma";
import { hashPassword } from "../utils/password";

/**
 * Crea eventos PASADOS en Kora con reservas, pagos y pedidos simulados
 * para llenar el panel de estadísticas. No toca eventos futuros (ej. agosto).
 *
 * Usa usuarios ficticios (stats-host-XX@kluby.demo) — NO cuentas de login demo.
 *
 * Ejecutar: npm run seed:kora-past-stats
 */

const KORA_CLUB_ID = "a13df687-c80f-4440-9c08-264424e57f0f";

/** Cuentas reales de demo — nunca usarlas como anfitriones de stats simuladas. */
export const REAL_LOGIN_EMAILS = [
  "anfitrion@kluby.com",
  "invitado1@kluby.com",
  "invitado2@kluby.com",
  "enzo@kluby.com",
  "miaca@hmail.com",
];

const STATS_HOST_COUNT = 12;
const STATS_HOST_EMAIL = (n: number) =>
  `stats-host-${String(n).padStart(2, "0")}@kluby.demo`;

/** Nombres de eventos en vivo / futuros que este script nunca modifica. */
const PROTECTED_NAME_PARTS = ["15 de agosto", "fest house", "15 de Agosto"];

const dec = (n: number): Prisma.Decimal => new Prisma.Decimal(n);

type TableDef = {
  label: string;
  sector: string;
  capacity: number;
  price: number;
  posX: number;
  posY: number;
};

const GENERAL_X = [5, 11, 17, 23, 29, 35, 41, 47, 53, 59];
const GENERAL_PRICES = [95000, 95000, 100000, 100000, 105000, 105000, 110000, 110000, 115000, 115000];

const generalRow = (row: 0 | 1, startNum: number): TableDef[] =>
  GENERAL_X.map((posX, i) => ({
    label: String(startNum + i),
    sector: "Pista General",
    capacity: i >= 4 && i <= 5 ? 10 : 8,
    price: GENERAL_PRICES[i]!,
    posX,
    posY: row === 0 ? 9 : 17,
  }));

const vip1Pairs: Array<[number, number]> = [
  [180000, 185000],
  [185000, 190000],
  [190000, 195000],
  [195000, 200000],
  [200000, 205000],
  [205000, 210000],
  [210000, 220000],
];

const vip1Tables = (): TableDef[] => {
  const out: TableDef[] = [];
  let n = 21;
  for (let row = 0; row < vip1Pairs.length; row++) {
    const [p1, p2] = vip1Pairs[row]!;
    const y = 24 + row * 8;
    out.push(
      { label: String(n++), sector: "VIP 1", capacity: 10, price: p1, posX: 78, posY: y },
      { label: String(n++), sector: "VIP 1", capacity: 10, price: p2, posX: 88, posY: y }
    );
  }
  return out;
};

const TABLE_DEFS: TableDef[] = [
  ...generalRow(0, 1),
  ...generalRow(1, 11),
  ...vip1Tables(),
  { label: "35", sector: "VIP 2", capacity: 10, price: 150000, posX: 7, posY: 78 },
  { label: "36", sector: "VIP 2", capacity: 10, price: 150000, posX: 16, posY: 78 },
  { label: "37", sector: "VIP 2", capacity: 10, price: 155000, posX: 25, posY: 78 },
  { label: "38", sector: "VIP 2", capacity: 10, price: 155000, posX: 7, posY: 91 },
  { label: "39", sector: "VIP 2", capacity: 10, price: 160000, posX: 16, posY: 91 },
  { label: "40", sector: "VIP 2", capacity: 10, price: 165000, posX: 25, posY: 91 },
];

const BOTTLES = [
  { name: "Vodka Absolut 750ml", category: "Vodka", price: 45000 },
  { name: "Champagne Chandon", category: "Espumante", price: 60000 },
  { name: "Combo Fernet + 2 Coca", category: "Combo", price: 28000 },
];

type PastEventDef = {
  name: string;
  /** Inicio de la noche (23:00 ART ≈ +3h UTC del día anterior). */
  date: Date;
  /** Mesas reservadas sobre 40. */
  reservedTables: number;
};

/** Nombres de eventos pasados generados por este script (para limpieza). */
export const PAST_EVENT_NAMES = [
  "Kora · Sábado 24 de Mayo",
  "Kora · Sábado 7 de Junio",
  "Kora · Sábado 14 de Junio",
] as const;

const PAST_EVENTS: PastEventDef[] = [
  {
    name: "Kora · Sábado 24 de Mayo",
    date: new Date("2026-05-25T02:00:00.000Z"),
    reservedTables: 18,
  },
  {
    name: "Kora · Sábado 7 de Junio",
    date: new Date("2026-06-08T02:00:00.000Z"),
    reservedTables: 26,
  },
  {
    name: "Kora · Sábado 14 de Junio",
    date: new Date("2026-06-15T02:00:00.000Z"),
    reservedTables: 30,
  },
];

type SlotKind = "COMPLETED" | "CHECKED_IN" | "NO_SHOW" | "CANCELLED" | "OPEN_TABLE";

const slotKindForIndex = (i: number): SlotKind => {
  const r = i % 10;
  if (r < 5) return "COMPLETED";
  if (r < 7) return "CHECKED_IN";
  if (r < 8) return "NO_SHOW";
  if (r < 9) return "CANCELLED";
  return "OPEN_TABLE";
};

const daysBeforeForIndex = (i: number): number => {
  const options = [0, 1, 2, 3, 5, 7, 10, 14];
  return options[i % options.length]!;
};

const isProtectedEventName = (name: string): boolean => {
  const lower = name.toLowerCase();
  return PROTECTED_NAME_PARTS.some((part) => lower.includes(part.toLowerCase()));
};

/** Usuarios ficticios solo para datos de estadísticas — no son cuentas de login. */
const ensureStatsDemoHosts = async (): Promise<{ id: string; email: string }[]> => {
  const passwordHash = await hashPassword("stats-demo-no-login");
  const hosts: { id: string; email: string }[] = [];

  for (let i = 1; i <= STATS_HOST_COUNT; i++) {
    const email = STATS_HOST_EMAIL(i);
    const user = await prisma.user.upsert({
      where: { email },
      create: {
        email,
        passwordHash,
        fullName: `Stats Host ${String(i).padStart(2, "0")}`,
        role: UserRole.CLIENT,
        isActive: true,
      },
      update: {},
      select: { id: true, email: true },
    });
    hosts.push(user);
  }

  return hosts;
};

const clearEventData = async (eventId: string): Promise<void> => {
  const reservations = await prisma.reservation.findMany({
    where: { eventId },
    select: { id: true },
  });
  const resIds = reservations.map((r) => r.id);
  if (resIds.length > 0) {
    await prisma.payment.deleteMany({ where: { reservationId: { in: resIds } } });
    await prisma.orderItem.deleteMany({
      where: { order: { reservationId: { in: resIds } } },
    });
    await prisma.order.deleteMany({ where: { reservationId: { in: resIds } } });
    await prisma.loyaltyTransaction.deleteMany({
      where: { reservationId: { in: resIds } },
    });
    await prisma.reservationGuest.deleteMany({
      where: { reservationId: { in: resIds } },
    });
    await prisma.reservation.deleteMany({ where: { eventId } });
  }
  await prisma.product.deleteMany({ where: { eventId } });
  await prisma.clubTable.deleteMany({ where: { eventId } });
  await prisma.eventNight.delete({ where: { id: eventId } });
};

const createEventShell = async (
  clubId: string,
  def: PastEventDef,
  mapUrl: string | null
) => {
  const existing = await prisma.eventNight.findFirst({
    where: { clubId, name: def.name },
  });
  if (existing !== null) {
    await clearEventData(existing.id);
  }

  const event = await prisma.eventNight.create({
    data: {
      clubId,
      name: def.name,
      date: def.date,
      musicGenre: "House",
      backgroundImage: mapUrl,
      defaultConsumptionPercent: 100,
    },
  });

  const tables = [];
  for (const t of TABLE_DEFS) {
    const table = await prisma.clubTable.create({
      data: {
        clubId,
        eventId: event.id,
        label: t.label,
        sector: t.sector,
        capacity: t.capacity,
        price: dec(t.price),
        consumptionPercent: 100,
        minConsumption: dec(t.price),
        depositPercent: 10,
        posX: t.posX,
        posY: t.posY,
      },
    });
    tables.push(table);
  }

  const products = [];
  for (const p of BOTTLES) {
    const product = await prisma.product.create({
      data: {
        clubId,
        eventId: event.id,
        name: p.name,
        category: p.category,
        price: dec(p.price),
        stock: 80,
      },
    });
    products.push(product);
  }

  return { event, tables, products };
};

const eventNightAt = (eventDate: Date, hoursAfterOpen: number): Date =>
  new Date(eventDate.getTime() + hoursAfterOpen * 3_600_000);

const seedReservation = async (opts: {
  clubId: string;
  eventId: string;
  eventDate: Date;
  table: { id: string; price: Prisma.Decimal };
  hostId: string;
  guestUsers: { id: string }[];
  products: { id: string; price: Prisma.Decimal; name: string }[];
  slotIndex: number;
  kind: SlotKind;
}): Promise<void> => {
  const price = Number(opts.table.price);
  const deposit = Math.round(price * 0.1);
  const balance = price - deposit;
  const bookedDaysBefore = daysBeforeForIndex(opts.slotIndex);
  const bookedAt = new Date(opts.eventDate.getTime() - bookedDaysBefore * 86_400_000);

  const statusMap: Record<SlotKind, ReservationStatus> = {
    COMPLETED: ReservationStatus.COMPLETED,
    CHECKED_IN: ReservationStatus.CHECKED_IN,
    NO_SHOW: ReservationStatus.NO_SHOW,
    CANCELLED: ReservationStatus.CANCELLED,
    OPEN_TABLE: ReservationStatus.COMPLETED,
  };
  const status = statusMap[opts.kind];
  const mode =
    opts.kind === "OPEN_TABLE" ? ReservationMode.OPEN_TABLE : ReservationMode.STANDARD;

  const checkInAt =
    status === ReservationStatus.CHECKED_IN || status === ReservationStatus.COMPLETED
      ? eventNightAt(opts.eventDate, 0.5 + (opts.slotIndex % 3) * 0.2)
      : null;
  const completedAt =
    status === ReservationStatus.COMPLETED
      ? eventNightAt(opts.eventDate, 4 + (opts.slotIndex % 2))
      : null;
  const cancelledAt =
    status === ReservationStatus.CANCELLED
      ? new Date(bookedAt.getTime() + 12 * 3_600_000)
      : null;
  const noShowAt =
    status === ReservationStatus.NO_SHOW
      ? eventNightAt(opts.eventDate, 6)
      : null;

  const reservation = await prisma.reservation.create({
    data: {
      clubId: opts.clubId,
      eventId: opts.eventId,
      tableId: opts.table.id,
      hostId: opts.hostId,
      mode,
      status,
      totalAmount: dec(price),
      depositAmount: dec(deposit),
      amountPaid: dec(0),
      maxGuests: mode === ReservationMode.OPEN_TABLE ? 10 : null,
      expiresAt: new Date(bookedAt.getTime() + 3_600_000),
      createdAt: bookedAt,
      confirmedAt:
        status === ReservationStatus.CANCELLED
          ? new Date(bookedAt.getTime() + 30_000)
          : new Date(bookedAt.getTime() + 60_000),
      checkedInAt: checkInAt,
      completedAt,
      cancelledAt,
      noShowAt,
    },
  });

  let paidTotal = 0;

  const addPayment = async (
    type: PaymentType,
    amount: number,
    at: Date,
    payStatus: PaymentStatus = PaymentStatus.APPROVED,
    guestId?: string,
    orderId?: string
  ): Promise<void> => {
    if (amount <= 0) return;
    await prisma.payment.create({
      data: {
        reservationId: reservation.id,
        userId: opts.hostId,
        guestId: guestId ?? null,
        orderId: orderId ?? null,
        type,
        amount: dec(amount),
        status: payStatus,
        provider: "demo",
        createdAt: at,
      },
    });
    if (payStatus === PaymentStatus.APPROVED) paidTotal += amount;
  };

  if (status === ReservationStatus.CANCELLED) {
    await addPayment(PaymentType.DEPOSIT, deposit, bookedAt);
    await addPayment(
      PaymentType.REFUND,
      Math.round(deposit * 0.5),
      cancelledAt ?? new Date(bookedAt.getTime() + 86_400_000),
      PaymentStatus.REFUNDED
    );
  } else if (
    status !== ReservationStatus.PENDING_PAYMENT &&
    status !== ReservationStatus.EXPIRED
  ) {
    await addPayment(PaymentType.DEPOSIT, deposit, bookedAt);
    await addPayment(
      PaymentType.BALANCE,
      balance,
      eventNightAt(opts.eventDate, 0.3 + (opts.slotIndex % 4) * 0.15)
    );
  }

  const attended =
    status === ReservationStatus.COMPLETED || status === ReservationStatus.CHECKED_IN;

  if (attended && opts.slotIndex % 2 === 0) {
    const product = opts.products[opts.slotIndex % opts.products.length]!;
    const qty = 1 + (opts.slotIndex % 3);
    const unit = Number(product.price);
    const subtotal = unit * qty;
    const orderAt = eventNightAt(opts.eventDate, 1 + (opts.slotIndex % 3));

    const order = await prisma.order.create({
      data: {
        reservationId: reservation.id,
        userId: opts.hostId,
        type: OrderType.LIVE,
        status: OrderStatus.DELIVERED,
        total: dec(subtotal),
        createdAt: orderAt,
      },
    });
    await prisma.orderItem.create({
      data: {
        orderId: order.id,
        productId: product.id,
        quantity: qty,
        unitPrice: dec(unit),
        subtotal: dec(subtotal),
      },
    });
    await addPayment(
      PaymentType.CONSUMPTION,
      subtotal,
      orderAt,
      PaymentStatus.APPROVED,
      undefined,
      order.id
    );
  }

  if (mode === ReservationMode.OPEN_TABLE && opts.guestUsers.length >= 2) {
    const guestA = opts.guestUsers[opts.slotIndex % opts.guestUsers.length]!;
    const guestB = opts.guestUsers[(opts.slotIndex + 1) % opts.guestUsers.length]!;
    const share = Math.round(price / 4);

    for (const guestUser of [guestA, guestB]) {
      const guest = await prisma.reservationGuest.create({
        data: {
          reservationId: reservation.id,
          userId: guestUser.id,
          status: GuestStatus.CONFIRMED,
          shareAmount: dec(share),
        },
      });
      await addPayment(
        PaymentType.GUEST_SHARE,
        share,
        eventNightAt(opts.eventDate, 1.2),
        PaymentStatus.APPROVED,
        guest.id
      );
    }
  }

  await prisma.reservation.update({
    where: { id: reservation.id },
    data: { amountPaid: dec(paidTotal) },
  });

  if (attended && paidTotal > 0) {
    const points = Math.max(50, Math.round(paidTotal / 1500));
    await prisma.loyaltyTransaction.create({
      data: {
        userId: opts.hostId,
        clubId: opts.clubId,
        reservationId: reservation.id,
        type: LoyaltyTxType.EARNED,
        points,
        description: "Puntos por consumo en noche Kora",
        createdAt: eventNightAt(opts.eventDate, 4.5),
      },
    });
    if (opts.slotIndex % 7 === 0) {
      const redeem = Math.min(120, Math.floor(points / 2));
      await prisma.loyaltyTransaction.create({
        data: {
          userId: opts.hostId,
          clubId: opts.clubId,
          reservationId: reservation.id,
          type: LoyaltyTxType.REDEEMED,
          points: redeem,
          description: "Canje en reserva",
          createdAt: eventNightAt(opts.eventDate, 0.2),
        },
      });
    }
  }
};

const main = async (): Promise<void> => {
  const club =
    (await prisma.club.findUnique({ where: { id: KORA_CLUB_ID } })) ??
    (await prisma.club.findFirst({
      where: { name: { contains: "Kora", mode: "insensitive" } },
    }));

  if (club === null) {
    throw new Error("Boliche Kora no encontrado. Ejecutá update-kora o creá el boliche primero.");
  }

  const hosts = await ensureStatsDemoHosts();
  const guestUsers = hosts.slice(1);
  const mapUrl = club.floorMapUrl;

  console.log(`[kora-past-stats] Boliche: ${club.name}`);
  console.log(
    `[kora-past-stats] Anfitriones stats (ficticios): ${hosts.map((h) => h.email).join(", ")}`
  );

  const protectedFuture = await prisma.eventNight.findMany({
    where: {
      clubId: club.id,
      date: { gte: new Date() },
    },
    select: { id: true, name: true, date: true },
  });
  for (const ev of protectedFuture) {
    const reservations = await prisma.reservation.count({ where: { eventId: ev.id } });
    if (reservations > 0 && isProtectedEventName(ev.name)) {
      console.warn(
        `[kora-past-stats] AVISO: el evento futuro «${ev.name}» tiene ${reservations} reservas — no se toca.`
      );
    } else {
      console.log(`[kora-past-stats] Evento futuro intacto: ${ev.name}`);
    }
  }

  const summary: string[] = [];

  for (const def of PAST_EVENTS) {
    if (def.date >= new Date()) {
      console.warn(`[kora-past-stats] Saltando ${def.name}: la fecha aún no pasó.`);
      continue;
    }

    const { event, tables, products } = await createEventShell(club.id, def, mapUrl);
    const reserved = Math.min(def.reservedTables, tables.length);

    for (let i = 0; i < reserved; i++) {
      const host = hosts[i % hosts.length]!;
      await seedReservation({
        clubId: club.id,
        eventId: event.id,
        eventDate: def.date,
        table: tables[i]!,
        hostId: host.id,
        guestUsers,
        products,
        slotIndex: i,
        kind: slotKindForIndex(i),
      });
    }

    const payments = await prisma.payment.aggregate({
      where: {
        status: PaymentStatus.APPROVED,
        reservation: { eventId: event.id },
      },
      _sum: { amount: true },
      _count: true,
    });
    summary.push(
      `${def.name}: ${reserved} mesas · $${Number(payments._sum.amount ?? 0).toLocaleString("es-AR")} · ${payments._count} pagos`
    );
  }

  console.log("\n========== EVENTOS PASADOS KORA ==========");
  for (const line of summary) console.log("  ·", line);
  console.log("\nPanel → Kora → Estadísticas → «Última noche»");
  console.log("Comparación: activá el checkbox y elegí dos noches de mayo/junio.");
  console.log("El evento de agosto / en vivo quedó sin datos de stats.");
  console.log("==========================================\n");
};

const isDirectRun = require.main === module;

if (isDirectRun) {
  main()
    .catch((error) => {
      console.error("[kora-past-stats] Error:", error);
      process.exitCode = 1;
    })
    .finally(() => {
      void prisma.$disconnect();
    });
}
