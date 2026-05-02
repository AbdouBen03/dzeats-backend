import express from "express";
import { register, login,saveFcmToken,updateProfile,changePassword,getMyStats } from "../controllers/authController.js";
import { verifyToken } from "../middleware/authMiddleware.js";

const router = express.Router();
router.post("/fcm-token", verifyToken, saveFcmToken);

router.post("/register", register);
router.post("/login", login);
router.put("/profile", verifyToken, updateProfile);
router.put("/change-password", verifyToken, changePassword);
router.get("/my-stats", verifyToken, getMyStats);

export default router;