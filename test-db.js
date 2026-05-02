import pool from "./config/db.js";

const testConnection = async () => {
  try {
    const result = await pool.query("SELECT NOW()");
    console.log("✅ Database connected:", result.rows[0]);
  } catch (err) {
    console.error("❌ DB error:", err.message);
  }
};

testConnection();