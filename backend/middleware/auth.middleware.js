/**
 * JWT 인증 미들웨어
 * 클라이언트의 쿠키에서 JWT 토큰을 추출하여 유효성(위조 여부 및 만료 시간)을 검증합니다.
 * 검증에 성공하면 해독된 유저 정보를 `req.user`에 담아 다음 라우터로 넘겨줍니다.
 * 실패 시 에러를 글로벌 에러 핸들러에 위임합니다 — 컨트롤러와 동일한 next(error) 패턴.
 */

const jwt = require("jsonwebtoken");

exports.verifyToken = (req, res, next) => {
  try {
    const token = req.cookies.accessToken;

    if (!token) {
      const err = new Error("로그인이 필요합니다.");
      err.status = 401;
      return next(err);
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    // 만료되었거나 위조된 토큰 — 클라이언트 쿠키도 즉시 제거
    res.clearCookie("accessToken");
    const err = new Error("유효하지 않거나 만료된 토큰입니다.");
    err.status = 401;
    next(err);
  }
};
