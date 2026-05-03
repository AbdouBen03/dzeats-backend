import pool from "../config/db.js";

export const getMenu = async (req, res) => {
  const { restaurant_id } = req.params;
  try {
    const result = await pool.query(
      "SELECT * FROM menu_items WHERE restaurant_id = $1 AND is_hidden = FALSE",
      [restaurant_id]
    );
    const formatted = result.rows.map(item => ({
      id: item.id,
      restaurant_id: item.restaurant_id,
      name: item.name,
      price: Number(item.price),
      is_hidden: item.is_hidden,
      image_url: item.image_url,
      category: item.category,
    }));
    res.json(formatted);
  } catch (err) {
    res.status(500).json(err.message);
  }
};

export const getOwnerMenu = async (req, res) => {
  try {
    const userId = req.user.id;

    const restaurant = await pool.query(
      "SELECT * FROM restaurants WHERE owner_id = $1",
      [userId]
    );

    if (restaurant.rows.length === 0) {
      return res.status(404).json({ error: "No restaurant found" });
    }

    const restaurantId = restaurant.rows[0].id;

    const result = await pool.query(
      "SELECT * FROM menu_items WHERE restaurant_id = $1 ORDER BY id DESC",
      [restaurantId]
    );

    const formatted = result.rows.map(item => ({
      id: item.id,
      restaurant_id: item.restaurant_id,
      name: item.name,
      price: Number(item.price),
      is_hidden: item.is_hidden,
      image_url: item.image_url,
      category: item.category,
    }));

    res.json({ restaurant: restaurant.rows[0], menu: formatted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const addMenuItem = async (req, res) => {
  try {
    const userId = req.user.id;

    const restaurant = await pool.query(
      "SELECT * FROM restaurants WHERE owner_id = $1",
      [userId]
    );

    if (restaurant.rows.length === 0) {
      return res.status(403).json({ error: "Not your restaurant" });
    }

    const { name, price, category } = req.body;
    const restaurantId = restaurant.rows[0].id;
    const imageUrl = req.file ? req.file.path : null;

    const result = await pool.query(
      "INSERT INTO menu_items (restaurant_id, name, price, image_url, category) VALUES ($1,$2,$3,$4,$5) RETURNING *",
      [restaurantId, name, Number(price), imageUrl, category || "Main"]
    );

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const editMenuItem = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { name, price, category } = req.body;
    const imageUrl = req.file ? req.file.path : null;

    const check = await pool.query(
      `SELECT mi.* FROM menu_items mi
       JOIN restaurants r ON mi.restaurant_id = r.id
       WHERE mi.id = $1 AND r.owner_id = $2`,
      [id, userId]
    );

    if (check.rows.length === 0) {
      return res.status(403).json({ error: "Not authorized" });
    }

    const result = imageUrl
      ? await pool.query(
          "UPDATE menu_items SET name = $1, price = $2, image_url = $3, category = $4 WHERE id = $5 RETURNING *",
          [name, Number(price), imageUrl, category || "Main", id]
        )
      : await pool.query(
          "UPDATE menu_items SET name = $1, price = $2, category = $3 WHERE id = $4 RETURNING *",
          [name, Number(price), category || "Main", id]
        );

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const deleteMenuItem = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const check = await pool.query(
      `SELECT mi.* FROM menu_items mi
       JOIN restaurants r ON mi.restaurant_id = r.id
       WHERE mi.id = $1 AND r.owner_id = $2`,
      [id, userId]
    );

    if (check.rows.length === 0) {
      return res.status(403).json({ error: "Not authorized" });
    }

    await pool.query("DELETE FROM menu_items WHERE id = $1", [id]);
    res.json({ message: "Item deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const toggleHideMenuItem = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const check = await pool.query(
      `SELECT mi.* FROM menu_items mi
       JOIN restaurants r ON mi.restaurant_id = r.id
       WHERE mi.id = $1 AND r.owner_id = $2`,
      [id, userId]
    );

    if (check.rows.length === 0) {
      return res.status(403).json({ error: "Not authorized" });
    }

    const current = check.rows[0].is_hidden;

    const result = await pool.query(
      "UPDATE menu_items SET is_hidden = $1 WHERE id = $2 RETURNING *",
      [!current, id]
    );

    res.json({ message: "Item updated", item: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};