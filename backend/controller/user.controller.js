const authService = require("../service/auth.service");
const { getDeviceType } = require("../utils/device");
const { getClientIp } = require("../utils/ip");

/**
 * 회원가입 컨트롤러
 * 클라이언트의 요청 데이터를 받아 서비스 계층에 넘기고 가입 성공/실패 여부를 응답합니다.
 * 
 * @param {Object} req - Express 요청 객체
 * @param {Object} req.body - 회원가입 요청 데이터 (아이디, 비밀번호, 닉네임 등)
 * @param {Object} res - Express 응답 객체
 * @param {Function} next - Express next 미들웨어 함수
 * @returns {Promise<void>} 201 (성공) 또는 400 (검증 실패/중복 등) 상태 코드 응답
 */
exports.signup = async (req, res, next) => {
    try {
    await authService.signup(req.body);
    res.status(201).json({ message: "회원가입이 완료되었습니다." });
  } catch (error) {
    next(error);
  }
}

/**
 * 로그인 컨트롤러
 * 유저를 검증하고, 접속 로그를 남긴 뒤, JWT(accessToken)를 HttpOnly 쿠키로 발급합니다.
 *
 * @param {Object} req - Express 요청 객체
 * @param {Object} req.body - 로그인 요청 데이터 (아이디/이메일, 비밀번호)
 * @param {Object} req.headers - 요청 헤더 (User-Agent 파싱 및 기기 정보 수집용)
 * @param {Object} res - Express 응답 객체
 * @param {Function} next - Express next 미들웨어 함수
 * @returns {Promise<void>} 200 (성공, 유저 정보 반환) 또는 401 (인증 실패) 상태 코드 응답
 */
exports.login = async (req, res, next) => {
  try {
    const userAgent = req.headers["user-agent"];
    const reqInfo = {
      ip: getClientIp(req), // 접속 IP
      userAgent: userAgent, // 브라우저 및 OS 원본 문자열
      deviceType: getDeviceType(userAgent), // 파싱된 기기 종류 (PC, Mobile 등)
    };

    const { user, token } = await authService.login(req.body, reqInfo);

    // JWT 토큰을 안전한 HttpOnly 쿠키로 발급 (XSS 방어 및 브라우저 탈취 방지)
    res.cookie("accessToken", token, {
      httpOnly: true, 
      secure: process.env.NODE_ENV === "production", // 실서버에서는 HTTPS에서만 동작
      sameSite: "Lax", // CSRF 공격 방어
      maxAge: 1000 * 60 * 60 * 24, // 쿠키 유효기간: 24시간
    });

    res.status(200).json({ 
      message: "로그인 성공!",
      user: {
        uuid: user.uuid,
        nickname: user.nickname,
        role: user.role
      }
    });
  } catch (error) {
    res.status(401).json({ message: error.message });
  }
};

/**
 * 로그아웃 컨트롤러
 * 프론트엔드의 인증 쿠키를 삭제하고 세션을 종료합니다.
 *
 * @param {Object} req - Express 요청 객체
 * @param {Object} res - Express 응답 객체
 * @param {Function} next - Express next 미들웨어 함수
 * @returns {Promise<void>} 200 (성공) 또는 500 (서버 에러) 상태 코드 응답
 */
exports.logout = async (req, res, next) => {
  try {
    // 프론트에 구워준 쿠키 삭제
    res.clearCookie("accessToken", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Lax",
    });

    // 만약 미들웨어를 거쳐서 user 정보와 sessionId가 있다면 DB도 오프라인 처리
    // (이 로직은 서비스로 빼는 게 좋지만, 구조 이해를 위해 적어둡니다)
    // await userRepository.updateSessionStatus(req.user.sessionId, false);

    res.status(200).json({ message: "성공적으로 로그아웃 되었습니다." });
  } catch (error) {
    res.status(500).json({ message: "로그아웃 처리 중 에러가 발생했습니다." });
  }
}