const pool = require("../config/db");

const upsertReset = async (email, token, expiresAt, db = pool) => {
  await db.query(
    `INSERT INTO password_resets(email, token, expires_at)
     VALUES($1,$2,$3)
     ON CONFLICT (email) DO UPDATE SET token=$2, expires_at=$3`,
    [email, token, expiresAt]
  );
};

const findByEmail = async (email, db = pool) => {
  const { rows } = await db.query(
    "SELECT token, expires_at FROM password_resets WHERE email=$1 LIMIT 1",
    [email]
  );
  return rows[0] || null;
};

const deleteByEmail = async (email, db = pool) => {
  await db.query("DELETE FROM password_resets WHERE email=$1", [email]);
};

module.exports = {
  upsertReset,
  findByEmail,
  deleteByEmail,
};