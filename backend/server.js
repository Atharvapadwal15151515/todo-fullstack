const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { Pool } = require("pg");

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

app.get("/", (req, res) => {
  res.send("TaskFlow Node API is running");
});

app.get("/api/todos", async (req, res) => {
  const result = await pool.query("SELECT * FROM todos ORDER BY id DESC");
  res.json(result.rows);
});

app.post("/api/todos", async (req, res) => {
  const { title, completed = false } = req.body;

  const result = await pool.query(
    "INSERT INTO todos (title, completed) VALUES ($1, $2) RETURNING *",
    [title, completed]
  );

  res.status(201).json(result.rows[0]);
});

app.put("/api/todos/:id", async (req, res) => {
  const { id } = req.params;
  const { title, completed } = req.body;

  const result = await pool.query(
    "UPDATE todos SET title = $1, completed = $2 WHERE id = $3 RETURNING *",
    [title, completed, id]
  );

  res.json(result.rows[0]);
});

app.delete("/api/todos/:id", async (req, res) => {
  const { id } = req.params;

  await pool.query("DELETE FROM todos WHERE id = $1", [id]);

  res.json({ message: "Todo deleted" });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});