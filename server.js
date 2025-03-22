require("dotenv").config();
const express = require("express");
const session = require("express-session");
const bodyParser = require("body-parser");
const { Pool } = require("pg");
const { v4: uuidv4 } = require("uuid");
const bcrypt = require("bcryptjs"); // using bcryptjs for compatibility

const app = express();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

// Set view engine and middleware
app.set("view engine", "ejs");
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use(
  session({
    secret: process.env.SESSION_SECRET, // e.g., "Haroldthabest" from your .env file
    resave: false,
    saveUninitialized: false,
  })
);

// Middleware to check if user is authenticated
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
      "SELECT * FROM giveaways ORDER BY created_at DESC"
    );
    res.render("index", { giveaways, user: req.session.user });
  } catch (error) {
    console.error("Error fetching giveaways:", error);
    res.send("Error fetching giveaways");
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
    await pool.query("INSERT INTO users (username, password) VALUES ($1, $2)", [
      username,
      hashedPassword,
    ]);
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
    const { rows } = await pool.query("SELECT * FROM users WHERE username = $1", [
      username,
    ]);
    if (rows.length === 0) {
      return res.send("Invalid username or password.");
    }
    const user = rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (match) {
      req.session.user = { id: user.id, username: user.username };
      res.redirect("/");
    } else {
      res.send("Invalid username or password.");
    }
  } catch (error) {
    console.error("Login error:", error);
    res.send("Error during login.");
  }
});

// Logout route
app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/");
});

// ----------------------
// Authenticated Routes
// ----------------------

// Create Giveaway page (only for logged in users)
app.get("/create", isAuthenticated, (req, res) => {
  res.render("create", { user: req.session.user });
});

// Handle giveaway creation
app.post("/create", isAuthenticated, async (req, res) => {
  const { name, channel_link } = req.body;
  const id = uuidv4();
  try {
    await pool.query(
      "INSERT INTO giveaways (id, user_id, name, channel_link) VALUES ($1, $2, $3, $4)",
      [id, req.session.user.id, name, channel_link]
    );
    res.redirect(`/dashboard/${id}`);
  } catch (error) {
    console.error("Error creating giveaway:", error);
    res.send("Error creating giveaway.");
  }
});

// Dashboard for a giveaway: shows referral leaderboard
app.get("/dashboard/:id", isAuthenticated, async (req, res) => {
  const { id } = req.params;
  try {
    // Ensure that the logged in user is the creator of this giveaway
    const giveawayRes = await pool.query("SELECT * FROM giveaways WHERE id = $1", [id]);
    if (giveawayRes.rows.length === 0) return res.send("Giveaway not found.");
    const giveaway = giveawayRes.rows[0];
    if (giveaway.user_id !== req.session.user.id)
      return res.send("Unauthorized access.");

    // Get referral leaderboard sorted descending by referral_count
    const { rows: referrals } = await pool.query(
      "SELECT * FROM referrals WHERE giveaway_id = $1 ORDER BY referral_count DESC",
      [id]
    );
    res.render("dashboard", { giveaway, referrals, user: req.session.user });
  } catch (error) {
    console.error("Dashboard error:", error);
    res.send("Error fetching dashboard.");
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

// Referral handler: when a user shares/join via a giveaway link
app.post("/refer/:id", async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;
  try {
    // Upsert referral record: add a new record or update the count if exists
    await pool.query(
      `INSERT INTO referrals (giveaway_id, referrer_name, referral_count)
       VALUES ($1, $2, 1)
       ON CONFLICT (giveaway_id, referrer_name)
       DO UPDATE SET referral_count = referrals.referral_count + 1`,
      [id, name]
    );
    // Get the channel link to redirect the user
    const { rows } = await pool.query("SELECT channel_link FROM giveaways WHERE id = $1", [id]);
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

// API endpoint to get referrals (referrer names and counts) for a specific giveaway.
app.get("/api/referrals/:id", async (req, res) => {
  const giveawayId = req.params.id;
  try {
    const { rows: referrals } = await pool.query(
      "SELECT referrer_name, referral_count FROM referrals WHERE giveaway_id = $1 ORDER BY referral_count DESC",
      [giveawayId]
    );
    res.json(referrals);
  } catch (error) {
    console.error("Error fetching referrals:", error);
    res.status(500).json({ error: "Error fetching referrals" });
  }
});

// ----------------------
// Start Server
// ----------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Blue Hark running on http://localhost:${PORT}`));
