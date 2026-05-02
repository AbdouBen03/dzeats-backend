import admin from "../config/firebase.js";
import pool from "../config/db.js";

// send to specific user by ID
export const sendNotification = async (userId, title, body, data = {}) => {
  try {
    const result = await pool.query(
      "SELECT fcm_token FROM users WHERE id = $1",
      [userId]
    );

    const token = result.rows[0]?.fcm_token;
    if (!token) return;

    await admin.messaging().send({
      token,
      notification: { title, body },
      data: { ...data, click_action: "FLUTTER_NOTIFICATION_CLICK" },
      android: {
        notification: {
          sound: "default",
          priority: "high",
          channel_id: "dzeats_channel",
        },
        priority: "high",
      },
      apns: {
        payload: {
          aps: {
            sound: "default",
            badge: 1,
          },
        },
      },
    });

    console.log(`✅ Notification sent to user ${userId}`);
  } catch (err) {
    console.error("NOTIFICATION ERROR:", err.message);
  }
};

// send to all users of a specific role
export const sendNotificationToRole = async (role, title, body, data = {}) => {
  try {
    const result = await pool.query(
      "SELECT id FROM users WHERE role = $1 AND fcm_token IS NOT NULL",
      [role]
    );

    for (const user of result.rows) {
      await sendNotification(user.id, title, body, data);
    }
  } catch (err) {
    console.error("ROLE NOTIFICATION ERROR:", err.message);
  }
};