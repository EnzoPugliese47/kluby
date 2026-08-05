import { Router } from "express";
import { uploadFlyer, uploadLogo, uploadMap, uploadProfile } from "../controllers/uploads.controller";
import { authenticate, authorize } from "../middlewares/auth";

const router = Router();

router.post("/profile", authenticate, uploadProfile);

router.post(
  "/map",
  authenticate,
  authorize("CLUB_ADMIN", "SUPER_ADMIN"),
  uploadMap
);

router.post(
  "/logo",
  authenticate,
  authorize("CLUB_ADMIN", "SUPER_ADMIN"),
  uploadLogo
);

router.post(
  "/flyer",
  authenticate,
  authorize("CLUB_ADMIN", "SUPER_ADMIN"),
  uploadFlyer
);

export default router;
