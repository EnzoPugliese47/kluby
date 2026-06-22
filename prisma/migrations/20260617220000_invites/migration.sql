-- Invitaciones de personal e invitados a eventos

CREATE TYPE "ClubPersonnelInviteRole" AS ENUM ('STAFF', 'PUERTA');

CREATE TABLE "ClubJoinInvite" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "role" "ClubPersonnelInviteRole" NOT NULL,
    "createdBy" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "maxUses" INTEGER NOT NULL DEFAULT 1,
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClubJoinInvite_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EventInvite" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "maxUses" INTEGER NOT NULL DEFAULT 50,
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventInvite_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EventInviteGuest" (
    "id" TEXT NOT NULL,
    "eventInviteId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "redeemedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventInviteGuest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClubJoinInvite_code_key" ON "ClubJoinInvite"("code");
CREATE INDEX "ClubJoinInvite_clubId_idx" ON "ClubJoinInvite"("clubId");
CREATE INDEX "ClubJoinInvite_code_idx" ON "ClubJoinInvite"("code");

CREATE UNIQUE INDEX "EventInvite_code_key" ON "EventInvite"("code");
CREATE INDEX "EventInvite_eventId_idx" ON "EventInvite"("eventId");
CREATE INDEX "EventInvite_clubId_idx" ON "EventInvite"("clubId");
CREATE INDEX "EventInvite_code_idx" ON "EventInvite"("code");

CREATE UNIQUE INDEX "EventInviteGuest_eventId_userId_key" ON "EventInviteGuest"("eventId", "userId");
CREATE INDEX "EventInviteGuest_userId_idx" ON "EventInviteGuest"("userId");

ALTER TABLE "ClubJoinInvite" ADD CONSTRAINT "ClubJoinInvite_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClubJoinInvite" ADD CONSTRAINT "ClubJoinInvite_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EventInvite" ADD CONSTRAINT "EventInvite_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "EventNight"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventInvite" ADD CONSTRAINT "EventInvite_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventInvite" ADD CONSTRAINT "EventInvite_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EventInviteGuest" ADD CONSTRAINT "EventInviteGuest_eventInviteId_fkey" FOREIGN KEY ("eventInviteId") REFERENCES "EventInvite"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventInviteGuest" ADD CONSTRAINT "EventInviteGuest_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "EventNight"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventInviteGuest" ADD CONSTRAINT "EventInviteGuest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
