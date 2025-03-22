require("dotenv").config();
const express = require("express");
const session = require("express-session");
const bodyParser = require("body-parser");
const { Pool } = require("pg");
const { v4: uuidv4 } = require("uuid");
const bcrypt = require("bcryptjs");
const cookieParser = require("cookie-parser");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Ensure uploads directory exists
const uploadsDir = "public/uploads";
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for profile picture uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    // Use user id and current timestamp for uniqueness
    cb(null, req.session.user.id + "_" + Date.now() + ext);
  }
});
const upload = multer({ storage });

app.set("view engine", "ejs");
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use(cookieParser());
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
  })
);

// Middleware to check if the user is authenticated
function isAuthenticated(req, res, next) {
  if (req.session.user) return next();
  res.redirect("/login");
}

// ----------------------
// Public Routes
// ----------------------

// Home page: lists all active giveaways
app.get("/", async (req, res) => {
  try {
    const { rows: giveaways } = await pool.query(
      "SELECT * FROM giveaways WHERE status = 'active' ORDER BY created_at DESC"
    );
    res.render("index", { giveaways, user: req.session.user });
  } catch (error) {
    console.error("Error fetching giveaways:", error);
    res.send("Error fetching giveaways.");
  }
});

// Signup routes
app.get("/signup", (req, res) => {
  res.render("signup");
});
app.post("/signup", async (req, res) => {
  const { username, password } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    await pool.query(
      "INSERT INTO users (username, password) VALUES ($1, $2)",
      [username, hashedPassword]
    );
    res.redirect("/login");
  } catch (error) {
    console.error("Signup error:", error);
    res.send("Error during signup. Username might be taken.");
  }
});

// Login routes
app.get("/login", (req, res) => {
  res.render("login");
});
app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  try {
    const { rows } = await pool.query(
      "SELECT * FROM users WHERE username = $1",
      [username]
    );
    if (rows.length === 0) return res.send("Invalid username or password.");
    const user = rows[0];
    if (await bcrypt.compare(password, user.password)) {
      req.session.user = {
        id: user.id,
        username: user.username,
        profile_pic: user.profile_pic || null,
      };
      res.redirect("/");
    } else {
      res.send("Invalid username or password.");
    }
  } catch (error) {
    console.error("Login error:", error);
    res.send("Error during login.");
  }
});

// No logout route – user remains permanently logged in

// ----------------------
// Authenticated Routes
// ----------------------

// Create Giveaway page
app.get("/create", isAuthenticated, (req, res) => {
  res.render("create", { user: req.session.user });
});
app.post("/create", isAuthenticated, async (req, res) => {
  const { name, channel_link } = req.body;
  const id = uuidv4();
  try {
    await pool.query(
      "INSERT INTO giveaways (id, user_id, name, channel_link, status) VALUES ($1, $2, $3, $4, 'active')",
      [id, req.session.user.id, name, channel_link]
    );
    res.redirect(`/dashboard/${id}`);
  } catch (error) {
    console.error("Error creating giveaway:", error);
    res.send("Error creating giveaway.");
  }
});

// Dashboard for a Giveaway: shows referral leaderboard, comments and management buttons
app.get("/dashboard/:id", isAuthenticated, async (req, res) => {
  const { id } = req.params;
  try {
    const { rows: giveawayRows } = await pool.query(
      "SELECT * FROM giveaways WHERE id = $1",
      [id]
    );
    if (giveawayRows.length === 0) return res.send("Giveaway not found.");
    const giveaway = giveawayRows[0];
    if (giveaway.user_id !== req.session.user.id)
      return res.send("Unauthorized access.");
    const { rows: referrals } = await pool.query(
      "SELECT * FROM referrals WHERE giveaway_id = $1 ORDER BY referral_count DESC",
      [id]
    );
    const { rows: comments } = await pool.query(
      "SELECT * FROM comments WHERE giveaway_id = $1 ORDER BY created_at ASC",
      [id]
    );
    res.render("dashboard", { giveaway, referrals, comments, user: req.session.user });
  } catch (error) {
    console.error("Dashboard error:", error);
    res.send("Error fetching dashboard.");
  }
});

// Delete Giveaway – only the giveaway owner can delete
app.post("/delete/:id", isAuthenticated, async (req, res) => {
  const { id } = req.params;
  try {
    const { rows: giveawayRows } = await pool.query(
      "SELECT * FROM giveaways WHERE id = $1",
      [id]
    );
    if (giveawayRows.length === 0) return res.send("Giveaway not found.");
    const giveaway = giveawayRows[0];
    if (giveaway.user_id !== req.session.user.id)
      return res.send("Unauthorized access. Only the giveaway owner can delete a giveaway.");
    await pool.query("DELETE FROM referrals WHERE giveaway_id = $1", [id]);
    await pool.query("DELETE FROM comments WHERE giveaway_id = $1", [id]);
    await pool.query("DELETE FROM giveaways WHERE id = $1", [id]);
    res.redirect("/profile");
  } catch (error) {
    console.error("Delete giveaway error:", error);
    res.send("Error deleting giveaway.");
  }
});

// Giveaway participation page (public)
app.get("/giveaway/:id", async (req, res) => {
  const { id } = req.params;
  try {
    res.render("giveaway", { giveawayId: id });
  } catch (error) {
    console.error("Giveaway page error:", error);
    res.send("Error loading giveaway.");
  }
});

// Referral handler: a device (by IP) can refer only once per giveaway
app.post("/refer/:id", async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;
  const ip = req.headers["x-forwarded-for"] || req.connection.remoteAddress;
  
  try {
    // Prevent self-referral if logged in
    if (req.session.user && req.session.user.username === name) {
      return res.send("You cannot refer yourself.");
    }
    
    // Check if a referral from this IP for this giveaway already exists
    const { rows: checkRows } = await pool.query(
      "SELECT * FROM referrals WHERE giveaway_id = $1 AND ip_address = $2",
      [id, ip]
    );
    if (checkRows.length > 0) {
      return res.send("Cannot refer more than once in a Giveaway thanks");
    }
    
    // Insert the referral record using ON CONFLICT DO NOTHING
    const result = await pool.query(
      `INSERT INTO referrals (giveaway_id, referrer_name, referral_count, ip_address)
       VALUES ($1, $2, 1, $3)
       ON CONFLICT (giveaway_id, ip_address) DO NOTHING`,
      [id, name, ip]
    );
    
    if (result.rowCount === 0) {
      return res.send("Cannot refer more than once in a Giveaway thanks");
    }
    
    const { rows } = await pool.query(
      "SELECT channel_link FROM giveaways WHERE id = $1",
      [id]
    );
    if (rows.length > 0) {
      res.redirect(rows[0].channel_link);
    } else {
      res.send("Invalid giveaway.");
    }
  } catch (error) {
    console.error("Referral error:", error);
    res.send("Error processing referral.");
  }
});

// Profile Page: shows user's giveaways, total referral points, and allows profile picture upload
app.get("/profile", isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { rows: giveaways } = await pool.query(
      "SELECT * FROM giveaways WHERE user_id = $1",
      [userId]
    );
    const { rows: totalRefs } = await pool.query(
      "SELECT COALESCE(SUM(referral_count), 0) AS total FROM referrals WHERE referrer_name = $1",
      [req.session.user.username]
    );
    const { rows: userRows } = await pool.query(
      "SELECT profile_pic FROM users WHERE id = $1",
      [userId]
    );
    if (userRows.length > 0) {
      req.session.user.profile_pic = userRows[0].profile_pic;
    }
    res.render("profile", { user: req.session.user, giveaways, totalRefs: totalRefs[0].total });
  } catch (error) {
    console.error("Profile error:", error);
    res.send("Error loading profile.");
  }
});

// Endpoint to upload a profile picture
app.post("/uploadProfilePic", isAuthenticated, upload.single("profilePic"), async (req, res) => {
  if (!req.file) return res.send("No file uploaded.");
  try {
    const filePath = "/uploads/" + req.file.filename;
    await pool.query("UPDATE users SET profile_pic = $1 WHERE id = $2", [filePath, req.session.user.id]);
    req.session.user.profile_pic = filePath;
    res.redirect("/profile");
  } catch (error) {
    console.error("Profile pic upload error:", error);
    res.send("Error uploading profile picture.");
  }
});

// Leaderboard: global top referrers with profile pictures
app.get("/leaderboard", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT referrer_name, SUM(referral_count) AS total_points FROM referrals GROUP BY referrer_name ORDER BY total_points DESC"
    );
    const leaderboard = await Promise.all(
      rows.map(async (entry) => {
        const { rows: userRows } = await pool.query(
          "SELECT profile_pic FROM users WHERE username = $1",
          [entry.referrer_name]
        );
        return {
          referrer_name: entry.referrer_name,
          total_points: entry.total_points,
          profile_pic: (userRows.length > 0 && userRows[0].profile_pic) ? userRows[0].profile_pic : "https://i.ibb.co/FLSgNhW9/Free.png",
        };
      })
    );
    res.render("leaderboard", { leaderboard, user: req.session.user });
  } catch (error) {
    console.error("Leaderboard error:", error);
    res.send("Error loading leaderboard.");
  }
});

// Notifications page (dummy example)
app.get("/notifications", isAuthenticated, async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC",
      [req.session.user.id]
    );
    res.render("notifications", { notifications: rows, user: req.session.user });
  } catch (error) {
    console.error("Notifications error:", error);
    res.send("Error loading notifications.");
  }
});

// Messages page (dummy example)
app.get("/messages", isAuthenticated, (req, res) => {
  res.render("messages", { user: req.session.user });
});

// API endpoint for referrals (optional)
app.get("/api/referrals/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query(
      "SELECT referrer_name, referral_count FROM referrals WHERE giveaway_id = $1 ORDER BY referral_count DESC",
      [id]
    );
    res.json(rows);
  } catch (error) {
    console.error("Error fetching referrals:", error);
    res.status(500).json({ error: "Error fetching referrals." });
  }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Giveaway system running on http://localhost:${PORT}`));
