import pool from "../config/db.js";

export const getFavorites = async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await pool.query(
      `SELECT r.* FROM restaurants r
       JOIN favorite_restaurants f ON r.id = f.restaurant_id
       WHERE f.user_id = $1
       ORDER BY f.id DESC`,
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Just the restaurant ids this user favourited (for showing filled hearts).
export const getFavoriteIds = async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await pool.query(
      "SELECT restaurant_id FROM favorite_restaurants WHERE user_id = $1",
      [userId]
    );
    res.json(result.rows.map((r) => r.restaurant_id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const toggleFavorite = async (req, res) => {
  try {
    const userId = req.user.id;
    const { restaurant_id } = req.body;

    const existing = await pool.query(
      "SELECT * FROM favorite_restaurants WHERE user_id = $1 AND restaurant_id = $2",
      [userId, restaurant_id]
    );

    if (existing.rows.length > 0) {
      await pool.query(
        "DELETE FROM favorite_restaurants WHERE user_id = $1 AND restaurant_id = $2",
        [userId, restaurant_id]
      );
      res.json({ message: "Removed from favorites", isFavorite: false });
    } else {
      await pool.query(
        "INSERT INTO favorite_restaurants (user_id, restaurant_id) VALUES ($1,$2)",
        [userId, restaurant_id]
      );
      res.json({ message: "Added to favorites", isFavorite: true });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};