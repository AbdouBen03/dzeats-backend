import express from "express";
import {
  createPost,
  getFeed,
  toggleLike,
  getComments,
  addComment,
  deletePost,
} from "../controllers/communityController.js";

import { verifyToken } from "../middleware/authMiddleware.js";
import { upload } from "../config/cloudinaryCommunity.js";

const router = express.Router();

// Feed
router.get("/", verifyToken, getFeed);

// Create a post (photo field name must be "photo")
router.post("/", verifyToken, upload.single("photo"), createPost);

// Likes
router.post("/:id/like", verifyToken, toggleLike);

// Comments
router.get("/:id/comments", verifyToken, getComments);
router.post("/:id/comments", verifyToken, addComment);

// Delete own post
router.delete("/:id", verifyToken, deletePost);

export default router;
