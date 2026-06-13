import cloudinary from "./cloudinary.js";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import multer from "multer";

// Community food photos: own folder, capped to 1080px wide but aspect ratio
// preserved (crop: "limit") so posts aren't force-cropped to a square.
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "dzeats/community",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
    transformation: [{ width: 1080, crop: "limit" }],
  },
});

export const upload = multer({ storage });
