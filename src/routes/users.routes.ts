import { Router } from "express";
import {
  banUser,
  createClubOwner,
  createStaffUser,
  deactivateUser,
  forgotPassword,
  getUserById,
  getUserTables,
  listMyClubMemberships,
  listUsers,
  loginUser,
  registerClubOwner,
  registerUser,
  resetPassword,
  unbanUser,
  updateUser,
} from "../controllers/users.controller";
import { listReservationsByHost } from "../controllers/reservations.controller";
import { listMyGuestEntries } from "../controllers/openTable.controller";
import { listChatAlertsForUser } from "../controllers/chat.controller";
import { authenticate, authorize } from "../middlewares/auth";

const router = Router();

const adminOnly = [authenticate, authorize("CLUB_ADMIN", "SUPER_ADMIN")];

router.post("/register", registerUser);
router.post("/register-owner", registerClubOwner);
router.post("/login", loginUser);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

router.post(
  "/owners",
  authenticate,
  authorize("SUPER_ADMIN"),
  createClubOwner
);

router.post(
  "/staff",
  authenticate,
  authorize("CLUB_ADMIN", "SUPER_ADMIN"),
  createStaffUser
);

router.get(
  "/me/memberships",
  authenticate,
  authorize("STAFF", "PUERTA"),
  listMyClubMemberships
);

router.get("/", authenticate, authorize("SUPER_ADMIN"), listUsers);
router.post("/:id/ban", ...adminOnly, banUser);
router.post("/:id/unban", ...adminOnly, unbanUser);
router.get("/:id/tables", ...adminOnly, getUserTables);

router.get("/:id", authenticate, getUserById);
router.patch("/:id", authenticate, updateUser);
router.delete("/:id", authenticate, deactivateUser);
router.get("/:id/reservations", authenticate, listReservationsByHost);
router.get("/:id/guest-entries", authenticate, listMyGuestEntries);
router.get("/:id/chat-alerts", authenticate, listChatAlertsForUser);

export default router;
