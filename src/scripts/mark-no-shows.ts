import { markNoShows } from "../jobs/markNoShows";
import { prisma } from "../lib/prisma";

void (async () => {
  const count = await markNoShows();
  console.log(`[mark-no-shows] ${count} reserva(s) marcada(s) como NO_SHOW`);
  await prisma.$disconnect();
})();
