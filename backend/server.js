const path = require("path");
require("dotenv").config();
const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const sendEmail = require("./utils/sendEmail");

const app = express();

app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-key";

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ error: "No token provided" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

app.get("/", (req, res) => {
  res.send("TaskSync Node API is running");
});

// TEST EMAIL
app.get("/test-email", async (req, res) => {
  try {
    const info = await sendEmail(
      "atharvapadwal24@gmail.com",
      "TaskSync Test Email",
      "Your email system is working!"
    );

    res.json(info);
  } catch (err) {
    res.status(500).json({
      message: err.message,
      code: err.code,
      command: err.command,
      response: err.response,
    });
  }
});

// REGISTER WITH EMAIL OTP
app.post("/api/auth/register", async (req, res) => {
  try {
    const { username, email, password, confirmPassword } = req.body;

    if (!username || !email || !password || !confirmPassword) {
      return res.status(400).json({ error: "All fields are required" });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ error: "Passwords do not match" });
    }

    const existingUser = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: "Email already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const userResult = await pool.query(
      `INSERT INTO users (username, email, password_hash, is_email_verified)
       VALUES ($1, $2, $3, false)
       RETURNING id, username, email`,
      [username, email, hashedPassword]
    );

    const user = userResult.rows[0];

    const otp = generateOtp();
    const otpHash = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await pool.query(
      `INSERT INTO email_otps (user_id, otp_hash, expires_at, used)
       VALUES ($1, $2, $3, false)`,
      [user.id, otpHash, expiresAt]
    );

    await sendEmail(
      email,
      "TaskSync Email Verification OTP",
      `Your TaskSync OTP is ${otp}. It will expire in 5 minutes.`
    );

    res.status(201).json({
      message: "Account created. OTP sent to email.",
      email: user.email,
      userId: user.id,
    });
  } catch (err) {
    console.error("REGISTER ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// VERIFY OTP
app.post("/api/auth/verify-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ error: "Email and OTP are required" });
    }

    const userResult = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(400).json({ error: "User not found" });
    }

    const user = userResult.rows[0];

    const otpResult = await pool.query(
      `SELECT * FROM email_otps
       WHERE user_id = $1 AND used = false AND expires_at > NOW()
       ORDER BY created_at DESC
       LIMIT 1`,
      [user.id]
    );

    if (otpResult.rows.length === 0) {
      return res.status(400).json({ error: "OTP expired or not found" });
    }

    const otpRecord = otpResult.rows[0];

    const isOtpValid = await bcrypt.compare(otp, otpRecord.otp_hash);

    if (!isOtpValid) {
      return res.status(400).json({ error: "Invalid OTP" });
    }

    await pool.query("UPDATE email_otps SET used = true WHERE id = $1", [
      otpRecord.id,
    ]);

    await pool.query("UPDATE users SET is_email_verified = true WHERE id = $1", [
      user.id,
    ]);

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        username: user.username,
      },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      message: "Email verified successfully",
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
      },
    });
  } catch (err) {
    console.error("OTP VERIFY ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// LOGIN
app.post("/api/auth/login", async (req, res) => {
  try {
   const { identifier, password } = req.body;

const result = await pool.query(
  "SELECT * FROM users WHERE email = $1 OR username = $1",
  [identifier]
);
    if (result.rows.length === 0) {
      return res.status(400).json({ error: "Invalid email or password" });
    }

    const user = result.rows[0];

    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      return res.status(400).json({ error: "Invalid email or password" });
    }

    if (!user.is_email_verified) {
      return res.status(403).json({
        error: "Please verify your email before logging in",
        requiresOtp: true,
      });
    }

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        username: user.username,
      },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// FORGOT PASSWORD
// FORGOT PASSWORD - SEND LINK + OTP
app.post("/api/auth/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    const userResult = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );

    // Security: same response even if email does not exist
    if (userResult.rows.length === 0) {
      return res.json({
        message: "If this email exists, a reset link and OTP have been sent.",
      });
    }

    const user = userResult.rows[0];

    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetOtp = generateOtp();

    const tokenHash = await bcrypt.hash(resetToken, 10);
    const otpHash = await bcrypt.hash(resetOtp, 10);

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await pool.query(
      `INSERT INTO password_resets (user_id, token_hash, otp_hash, expires_at, used)
       VALUES ($1, $2, $3, $4, false)`,
      [user.id, tokenHash, otpHash, expiresAt]
    );

    const resetLink = `${process.env.FRONTEND_URL}/reset-password?email=${encodeURIComponent(
      email
    )}&token=${resetToken}`;

    await sendEmail(
      email,
      "TaskSync Password Reset",
      `You requested to reset your TaskSync password.

Option 1: Reset using link
${resetLink}

Option 2: Reset using OTP
Your OTP is: ${resetOtp}

This link and OTP expire in 15 minutes.`
    );

    res.json({
      message: "If this email exists, a reset link and OTP have been sent.",
    });
  } catch (err) {
    console.error("FORGOT PASSWORD ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// VERIFY RESET OTP
app.post("/api/auth/verify-reset-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        error: "Email and OTP are required",
      });
    }

    const userResult = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(400).json({
        error: "User not found",
      });
    }

    const user = userResult.rows[0];

    const resetResult = await pool.query(
      `SELECT *
       FROM password_resets
       WHERE user_id = $1
         AND used = false
         AND expires_at > NOW()
       ORDER BY created_at DESC
       LIMIT 1`,
      [user.id]
    );

    if (resetResult.rows.length === 0) {
      return res.status(400).json({
        error: "OTP expired or not found",
      });
    }

    const resetRecord = resetResult.rows[0];

    const isOtpValid = await bcrypt.compare(
      otp,
      resetRecord.otp_hash
    );

    if (!isOtpValid) {
      return res.status(400).json({
        error: "Invalid OTP",
      });
    }

    res.json({
      verified: true,
      message: "OTP verified successfully.",
    });

  } catch (err) {
    console.error("VERIFY RESET OTP ERROR:", err);
    res.status(500).json({
      error: err.message,
    });
  }
});

// RESET PASSWORD
// RESET PASSWORD - LINK OR OTP
app.post("/api/auth/reset-password", async (req, res) => {
  try {
    const { email, token, otp, newPassword, confirmPassword } = req.body;

    if (!email || !newPassword || !confirmPassword) {
      return res.status(400).json({ error: "All fields are required" });
    }

    if (!token && !otp) {
      return res.status(400).json({ error: "Reset token or OTP is required" });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: "Passwords do not match" });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        error: "Password must be at least 8 characters",
      });
    }

    const userResult = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(400).json({ error: "Invalid reset request" });
    }

    const user = userResult.rows[0];

    const resetResult = await pool.query(
      `SELECT *
       FROM password_resets
       WHERE user_id = $1
         AND used = false
         AND expires_at > NOW()
       ORDER BY created_at DESC`,
      [user.id]
    );

    if (resetResult.rows.length === 0) {
      return res.status(400).json({
        error: "Invalid or expired reset request",
      });
    }

    let validReset = null;

    for (const record of resetResult.rows) {
      let isMatch = false;

      if (token) {
        isMatch = await bcrypt.compare(token, record.token_hash);
      }

      if (otp && record.otp_hash) {
        isMatch = await bcrypt.compare(otp, record.otp_hash);
      }

      if (isMatch) {
        validReset = record;
        break;
      }
    }

    if (!validReset) {
      return res.status(400).json({
        error: "Invalid or expired reset token/OTP",
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await pool.query(
      "UPDATE users SET password_hash = $1 WHERE id = $2",
      [hashedPassword, user.id]
    );

    await pool.query(
      "UPDATE password_resets SET used = true WHERE id = $1",
      [validReset.id]
    );

    res.json({
      message: "Password reset successful",
    });
  } catch (err) {
    console.error("RESET PASSWORD ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// GUEST LOGIN
app.post("/api/auth/guest", (req, res) => {
  const token = jwt.sign(
    {
      id: null,
      username: "Guest",
      role: "guest",
    },
    JWT_SECRET,
    { expiresIn: "1d" }
  );

  res.json({
    token,
    user: {
      id: null,
      username: "Guest",
      role: "guest",
    },
  });
});

// GET TODOS
app.get("/api/todos", authMiddleware, async (req, res) => {
  try {
    if (req.user.role === "guest") {
      return res.json([]);
    }

    const result = await pool.query(
      "SELECT * FROM todos WHERE user_id = $1 ORDER BY id DESC",
      [req.user.id]
    );

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ADD TODO
app.post("/api/todos", authMiddleware, async (req, res) => {
  try {
    if (req.user.role === "guest") {
      return res.status(403).json({
        error: "Guest todos should be stored in localStorage",
      });
    }

    const { title, completed = false } = req.body;

    const result = await pool.query(
      "INSERT INTO todos (title, completed, user_id) VALUES ($1, $2, $3) RETURNING *",
      [title, completed, req.user.id]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// UPDATE TODO
app.put("/api/todos/:id", authMiddleware, async (req, res) => {
  try {
    if (req.user.role === "guest") {
      return res.status(403).json({
        error: "Guest todos should be stored in localStorage",
      });
    }

    const { title, completed } = req.body;

    const result = await pool.query(
      "UPDATE todos SET title = $1, completed = $2 WHERE id = $3 AND user_id = $4 RETURNING *",
      [title, completed, req.params.id, req.user.id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE TODO
app.delete("/api/todos/:id", authMiddleware, async (req, res) => {
  try {
    if (req.user.role === "guest") {
      return res.status(403).json({
        error: "Guest todos should be stored in localStorage",
      });
    }

    await pool.query("DELETE FROM todos WHERE id = $1 AND user_id = $2", [
      req.params.id,
      req.user.id,
    ]);

    res.json({ message: "Todo deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});