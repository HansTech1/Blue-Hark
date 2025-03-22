require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // disables verification of the server certificate
  }
});

(async () => {
  try {
    const res = await pool.query("SELECT NOW() as now");
    console.log("Database connected, current time:", res.rows[0].now);
  } catch (error) {
    console.error("Database connectivity test failed:", error);
  } finally {
    await pool.end();
  }
})();
