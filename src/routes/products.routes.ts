import { Router } from "express";
import {
  deactivateProduct,
  updateProduct,
} from "../controllers/products.controller";
import { authenticate, authorize } from "../middlewares/auth";

const router = Router();

const adminOnly = [authenticate, authorize("CLUB_ADMIN", "SUPER_ADMIN")];

router.patch("/:id", ...adminOnly, updateProduct);
router.delete("/:id", ...adminOnly, deactivateProduct);

export default router;
