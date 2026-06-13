import pool from "../config/db.js";

export const submitComplaint = async (req, res) => {
  try {
    const userId = req.user.id;
    const { order_id, type, description } = req.body;

    const result = await pool.query(
      `INSERT INTO complaints (user_id, order_id, type, description)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [userId, order_id, type, description]
    );

    res.json({ message: "Complaint submitted", complaint: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getMyComplaints = async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await pool.query(
      `SELECT * FROM complaints WHERE user_id = $1 ORDER BY id DESC`,
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getAllComplaints = async (req, res) => {
  try {
    // Include WHO filed it (name + role) and the related order's context
    // (restaurant + driver) so the admin can read and understand each report.
    const result = await pool.query(
      `SELECT c.*,
              u.name  AS reporter_name,
              u.phone AS reporter_phone,
              u.role  AS reporter_role,
              o.status AS order_status,
              o.total  AS order_total,
              r.name AS restaurant_name,
              d.name AS driver_name,
              -- keep legacy field names for backward compatibility
              u.name  AS customer_name,
              u.phone AS customer_phone
       FROM complaints c
       LEFT JOIN users u ON c.user_id = u.id
       LEFT JOIN orders o ON c.order_id = o.id
       LEFT JOIN restaurants r ON o.restaurant_id = r.id
       LEFT JOIN users d ON o.driver_id = d.id
       ORDER BY (c.status = 'pending') DESC, c.id DESC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const updateComplaintStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const result = await pool.query(
      "UPDATE complaints SET status = $1 WHERE id = $2 RETURNING *",
      [status, id]
    );

    res.json({ message: "Status updated", complaint: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};