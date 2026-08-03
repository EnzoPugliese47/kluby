import { ReservationStatus } from "../generated/prisma/client";
import { prisma } from "../lib/prisma";
import { EVENT_OPEN_TABLE_ACTIVE_HOURS } from "../utils/eventTiming";

/**
 * Marca como NO_SHOW las reservas CONFIRMED sin check-in
 * una vez pasadas las horas de gracia del boliche tras el inicio del evento.
 */
export const markNoShows = async (now: Date = new Date()): Promise<number> => {
  const candidates = await prisma.reservation.findMany({
    where: {
      status: ReservationStatus.CONFIRMED,
      checkedInAt: null,
    },
    select: {
      id: true,
      event: { select: { date: true } },
      club: { select: { noShowGraceHours: true } },
    },
  });

  const ids = candidates
    .filter((r) => {
      const graceHours =
        r.club.noShowGraceHours ?? EVENT_OPEN_TABLE_ACTIVE_HOURS;
      return (
        r.event.date.getTime() + graceHours * 3_600_000 < now.getTime()
      );
    })
    .map((r) => r.id);

  if (ids.length === 0) return 0;

  const { count } = await prisma.reservation.updateMany({
    where: {
      id: { in: ids },
      status: ReservationStatus.CONFIRMED,
    },
    data: {
      status: ReservationStatus.NO_SHOW,
      noShowAt: now,
    },
  });

  return count;
};
