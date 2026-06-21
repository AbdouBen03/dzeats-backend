import express from "express";
import { getFavorites, toggleFavorite, getFavoriteIds } from "../controllers/favoriteController.js";
import { verifyToken } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", verifyToken, getFavorites);
router.get("/ids", verifyToken, getFavoriteIds);
router.post("/toggle", verifyToken, toggleFavorite);

export default router;