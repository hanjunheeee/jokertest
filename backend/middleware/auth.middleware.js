const jwt = require("jsonwebtoken");

exports.verifyToken = (req, res, next) => {
  try {
    // 프론트가 보낸 쿠키에서 토큰 빼오기 (cookie-parser 덕분에 가능)
    const token = req.cookies.accessToken; 

    if (!token) {
      return res.status(401).json({ message: "로그인이 필요합니다. (토큰 없음)" });
    }

    // 토큰 위조검사 & 해독
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // 해독한 유저 정보를 다음 라우터에서 쓸 수 있게 req에 달아줌
    req.user = decoded; 
    next(); // 통과!
  } catch (error) {
    // 토큰 만료됐거나 위조됐으면 입구컷
    res.clearCookie("accessToken"); // 썩은 토큰은 버려줌
    return res.status(401).json({ message: "유효하지 않거나 만료된 토큰입니다." });
  }
};