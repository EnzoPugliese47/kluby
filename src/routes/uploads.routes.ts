import { Router } from "express";
import { uploadLogo, uploadMap } from "../controllers/uploads.controller";
import { authenticate, authorize } from "../middlewares/auth";

const router = Router();

router.post(
  "/map",
  authenticate,
  authorize("STAFF", "CLUB_ADMIN", "SUPER_ADMIN"),
  uploadMap
);

router.post(
  "/logo",
  authenticate,
  authorize("CLUB_ADMIN", "SUPER_ADMIN"),
  uploadLogo
);

export default router;
