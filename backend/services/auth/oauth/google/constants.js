// Google OAuth 주소 상수 파일, 인가·토큰·프로필 주소
// 시험이 토큰·프로필 주소로 가짜 fetch를 나눔

// 로그인 화면으로 보낼 인가 주소
const GOOGLE_AUTH_ENDPOINT      = "https://accounts.google.com/o/oauth2/v2/auth";

const GOOGLE_TOKEN_ENDPOINT     = "https://oauth2.googleapis.com/token";

const GOOGLE_USERINFO_ENDPOINT  = "https://openidconnect.googleapis.com/v1/userinfo";

exports.GOOGLE_TOKEN_ENDPOINT = GOOGLE_TOKEN_ENDPOINT;

exports.GOOGLE_USERINFO_ENDPOINT = GOOGLE_USERINFO_ENDPOINT;

exports.GOOGLE_AUTH_ENDPOINT = GOOGLE_AUTH_ENDPOINT;
