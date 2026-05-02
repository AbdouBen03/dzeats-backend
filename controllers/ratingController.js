import pool from "../config/db.js";

export const submitRating = async (req, res) => {
  try {
    const userId = req.user.id;
    const { order_id, rating, comment } = req.body;

    // get restaurant_id from order
    const order = await pool.query(
      "SELECT * FROM orders WHERE id = $1 AND user_id = $2",
      [order_id, userId]
    );

    if (order.rows.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (order.rows[0].status !== "delivered") {
      return res.status(400).json({ error: "Can only rate delivered orders" });
    }

    const restaurantId = order.rows[0].restaurant_id;

    // check if already rated
    const existing = await pool.query(
      "SELECT * FROM ratings WHERE order_id = $1 AND user_id = $2",
      [order_id, userId]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ error: "Already rated this order" });
    }

    // insert rating
    await pool.query(
      "INSERT INTO ratings (order_id, user_id, restaurant_id, rating, comment) VALUES ($1,$2,$3,$4,$5)",
      [order_id, userId, restaurantId, rating, comment]
    );

    // update avg rating on restaurant
    const avg = await pool.query(
      "SELECT ROUND(AVG(rating), 1) as avg FROM ratings WHERE restaurant_id = $1",
      [restaurantId]
    );

    await pool.query(
      "UPDATE restaurants SET avg_rating = $1 WHERE id = $2",
      [avg.rows[0].avg, restaurantId]
    );

    res.json({ message: "Rating submitted ⭐" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

export const getRestaurantRatings = async (req, res) => {
  try {
    const { restaurant_id } = req.params;

    const result = await pool.query(
      `SELECT r.*, u.name AS customer_name
       FROM ratings r
       LEFT JOIN users u ON r.user_id = u.id
       WHERE r.restaurant_id = $1
       ORDER BY r.id DESC`,
      [restaurant_id]
    );

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};