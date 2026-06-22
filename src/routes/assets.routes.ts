import { Router } from "express";
import { getStoredAsset } from "../controllers/assets.controller";

const router = Router();

router.get("/:id", getStoredAsset);

export default router;
