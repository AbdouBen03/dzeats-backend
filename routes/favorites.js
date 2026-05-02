import express from "express";
import { getFavorites, toggleFavorite } from "../controllers/favoriteController.js";
import { verifyToken } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", verifyToken, getFavorites);
router.post("/toggle", verifyToken, toggleFavorite);

export default router;