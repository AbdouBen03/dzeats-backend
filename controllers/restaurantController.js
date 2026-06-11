import pool from "../config/db.js";

export const getRestaurants = async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM restaurants ORDER BY is_open DESC, id DESC"
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json(err.message);
  }
};

export const createRestaurant = async (req, res) => {
  const { name, location } = req.body;
  try {
    const result = await pool.query(
      "INSERT INTO restaurants (name, location) VALUES ($1, $2) RETURNING *",
      [name, location]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json(err.message);
  }
};

// Owner updates their restaurant settings
export const updateRestaurantSettings = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      is_open,
      opening_time,
      closing_time,
      delivery_fee,
      min_order,
      delivery_time_min,
      delivery_time_max,
      category,
      delivery_zone,
      latitude,
      longitude,
    } = req.body;

    const result = await pool.query(
      `UPDATE restaurants SET
        is_open = $1,
        opening_time = $2,
        closing_time = $3,
        delivery_fee = $4,
        min_order = $5,
        delivery_time_min = $6,
        delivery_time_max = $7,
        category = $8,
        delivery_zone = $9,
        latitude = COALESCE($10, latitude),
        longitude = COALESCE($11, longitude)
       WHERE owner_id = $12
       RETURNING *`,
      [
        is_open,
        opening_time,
        closing_time,
        Number(delivery_fee),
        Number(min_order),
        Number(delivery_time_min),
        Number(delivery_time_max),
        category,
        delivery_zone,
        latitude != null ? Number(latitude) : null,
        longitude != null ? Number(longitude) : null,
        userId,
      ]
    );

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const updateMyRestaurant = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, location } = req.body;
    const bannerUrl = req.file ? req.file.path : null;

    const result = bannerUrl
      ? await pool.query(
          "UPDATE restaurants SET name = $1, location = $2, banner_url = $3 WHERE owner_id = $4 RETURNING *",
          [name, location, bannerUrl, userId]
        )
      : await pool.query(
          "UPDATE restaurants SET name = $1, location = $2 WHERE owner_id = $3 RETURNING *",
          [name, location, userId]
        );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Restaurant not found" });
    }

    res.json({ message: "Restaurant updated", restaurant: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
