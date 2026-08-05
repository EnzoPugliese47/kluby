import fs from "fs";
import path from "path";
import { prisma } from "../lib/prisma";
import { saveStoredAsset } from "../utils/storedAsset";

const CLUB_ID = "a13df687-c80f-4440-9c08-264424e57f0f";
const LOGO_PATH =
  process.argv[2] ??
  path.join(
    process.cwd(),
    "public/logos/kora.png"
  );

const main = async (): Promise<void> => {
  const buffer = fs.readFileSync(LOGO_PATH);
  const imageUrl = await saveStoredAsset("image/png", buffer, "kora-logo.png");

  const club = await prisma.club.update({
    where: { id: CLUB_ID },
    data: { name: "Kora", imageUrl },
    select: { id: true, name: true, imageUrl: true },
  });

  console.log("[update-kora] Boliche actualizado:", club);
};

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
