// 필요한 모듈 불러오기
// JWT(JSON Web Token) 생성 및 서명을 위한 모듈을 가져옵니다.
const jwt = require("jsonwebtoken");

// 토큰 발급 유틸리티 함수 정의
/**
 * @desc    유저 정보를 담은 JWT(출입증)를 생성하여 발급합니다.
 * 로그인 성공 시 호출되며, 발급된 토큰은 1일(1d) 동안 유효합니다.
 * 환경변수에 암호화 키(JWT_SECRET)가 없으면 기본값을 사용합니다.
 * @param   {Object} payload - 토큰 안에 담을 핵심 데이터 (예: uuid, role, sessionId 등)
 * @returns {String} 안전하게 서명(Sign)이 완료된 JWT 문자열
 */
exports.generateToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_SECRET || "default_secret_key", {
    expiresIn: "1d", // 토큰 유효기간 설정: 1일 유지
  });
};