const path = require("path");
const dotenv = require("dotenv");
const { Pool } = require("pg");


dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config();

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "postgres",
  password: String(process.env.DB_PASSWORD ?? ""),
  database: process.env.DB_NAME || "postgres",
  port: Number.parseInt(process.env.DB_PORT || "5432", 10),
});

module.exports = pool;
