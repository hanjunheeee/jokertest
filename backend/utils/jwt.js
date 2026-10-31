const jwt = require("jsonwebtoken");

exports.generateToken = (payload, options = {}) => {
    return jwt.sign(payload, process.env.JWT_SECRET, {
        expiresIn: options.expiresIn ?? "1d",
    });
};
