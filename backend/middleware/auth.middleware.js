const jwt = require("jsonwebtoken");
const { createError } = require("../utils/appError");

exports.verifyToken = (req, res, next) => {
    try {
        const token = req.cookies.accessToken;

        if (!token) {
            return next(createError("로그인이 필요합니다.", 401));
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        res.clearCookie("accessToken");
        next(createError("유효하지 않거나 만료된 토큰입니다.", 401));
    }
};
