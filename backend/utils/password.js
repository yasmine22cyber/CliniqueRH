const bcrypt = require("bcryptjs");

const isBcryptHash = (value) => typeof value === "string" && value.startsWith("$2");

const verifyPassword = async (rawPassword, storedPassword) => {
  if (typeof storedPassword !== "string" || !storedPassword) {
    return false;
  }

  if (isBcryptHash(storedPassword)) {
    return bcrypt.compare(rawPassword, storedPassword);
  }


  return rawPassword === storedPassword;
};

module.exports = {
  verifyPassword,
};
