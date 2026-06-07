const jwt = require("jsonwebtoken");

/**
 * JWT 인증 미들웨어 
 * 클라이언트의 쿠키에서 JWT 토큰을 추출하여 유효성(위조 여부 및 만료 시간)을 검증합니다.
 * 검증에 성공하면 해독된 유저 정보를 `req.user`에 담아 다음 라우터로 넘겨줍니다.
 *
 * @param {Object} req - Express 요청 객체 (req.cookies.accessToken 파싱)
 * @param {Object} res - Express 응답 객체
 * @param {Function} next - Express next 미들웨어 함수
 * @returns {Object|void} 401 (토큰 없음/만료/위조) 상태 코드 응답 또는 다음 미들웨어(컨트롤러) 호출
 */
exports.verifyToken = (req, res, next) => {
  try {
    // 프론트가 보낸 쿠키에서 토큰 빼오기 (cookie-parser 미들웨어가 미리 파싱)
    const token = req.cookies.accessToken; 

    // 토큰이 아예 없는 경우 (비로그인 상태로 접근 시도) 입구에 컷
    if (!token) {
      return res.status(401).json({ message: "로그인이 필요합니다. (토큰 없음)" });
    }

    // 토큰 위조검사 & 해독
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // 해독한 유저 정보를 다음 라우터에서 쓸 수 있게 req에 달아줌
    req.user = decoded; 

    // 다음
    next(); 
  } catch (error) {
    // 토큰이 만료되었거나 누군가 임의로 조작(위조)한 경우
    res.clearCookie("accessToken"); // 썩은 토큰은 버려줌
    return res.status(401).json({ message: "유효하지 않거나 만료된 토큰입니다." });
  }
};