-- Plan elegido al registrarse como dueño (se aplica al crear el primer boliche).

ALTER TABLE "User" ADD COLUMN "signupClubPlan" "ClubPlan";
