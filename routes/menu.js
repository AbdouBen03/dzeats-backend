import express from "express";
import {
  getMenu,
  addMenuItem,
  deleteMenuItem,
  toggleHideMenuItem,
  getOwnerMenu,
  editMenuItem
} from "../controllers/menuController.js";
import { verifyToken } from "../middleware/authMiddleware.js";
import { checkRole } from "../middleware/roleMiddleware.js";
import { upload } from "../config/cloudinary.js";

const router = express.Router();

router.get("/owner/my-menu", verifyToken, checkRole(["restaurant_owner"]), getOwnerMenu);
router.get("/:restaurant_id", getMenu);
router.post("/", verifyToken, checkRole(["restaurant_owner"]), upload.single("image"), addMenuItem);
router.delete("/:id", verifyToken, checkRole(["restaurant_owner"]), deleteMenuItem);
router.put("/:id/toggle-hide", verifyToken, checkRole(["restaurant_owner"]), toggleHideMenuItem);
router.put("/:id/edit", verifyToken, checkRole(["restaurant_owner"]), upload.single("image"), editMenuItem);

export default router;