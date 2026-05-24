const jwt = require("jsonwebtoken");

exports.generateToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_SECRET || "default_secret_key", {
    expiresIn: "1d", // 1일 유지
  });
};