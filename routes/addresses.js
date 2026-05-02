import express from "express";
import {
  getSavedAddresses,
  addSavedAddress,
  deleteSavedAddress
} from "../controllers/savedAddressController.js";
import { verifyToken } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", verifyToken, getSavedAddresses);
router.post("/", verifyToken, addSavedAddress);
router.delete("/:id", verifyToken, deleteSavedAddress);

export default router;