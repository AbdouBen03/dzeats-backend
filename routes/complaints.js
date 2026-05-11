import express from "express";
import {
  submitComplaint,
  getMyComplaints,
  getAllComplaints,
  updateComplaintStatus,
} from "../controllers/complaintController.js";
import { verifyToken } from "../middleware/authMiddleware.js";
import { checkRole } from "../middleware/roleMiddleware.js";

const router = express.Router();

router.post("/", verifyToken, submitComplaint);
router.get("/my", verifyToken, getMyComplaints);
router.get("/", verifyToken, checkRole(["admin"]), getAllComplaints);
router.put("/:id/status", verifyToken, checkRole(["admin"]), updateComplaintStatus);

export default router;