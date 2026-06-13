import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import authRoutes from "./routes/auth.js";
import restaurantRoutes from "./routes/restaurants.js";
import menuRoutes from "./routes/menu.js";
import orderRoutes from "./routes/orders.js";
import adminRoutes from "./routes/admin.js"; 
import ratingRoutes from "./routes/ratings.js";
import addressRoutes from "./routes/addresses.js";
import favoriteRoutes from "./routes/favorites.js";
import promoRoutes from "./routes/promo.js";
import complaintRoutes from "./routes/complaints.js";
import communityRoutes from "./routes/community.js";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

// ✅ All routes BEFORE app.listen
app.use("/api/auth", authRoutes);
app.use("/api/restaurants", restaurantRoutes);
app.use("/api/menu", menuRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/admin", adminRoutes); 
app.use("/api/ratings", ratingRoutes);
app.use("/api/addresses", addressRoutes);
app.use("/api/favorites", favoriteRoutes);
app.use("/api/promo", promoRoutes);
app.use("/api/complaints", complaintRoutes);
app.use("/api/community", communityRoutes);

app.get("/", (req, res) => {
  res.send("DZeats API is working 🚀");
});

app.listen(5000, "0.0.0.0", () => {
  console.log("Server running on port 5000");
});