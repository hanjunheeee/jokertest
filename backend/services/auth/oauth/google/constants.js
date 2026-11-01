// Google OAuth 주소 상수 파일, 인가·토큰·프로필 주소
// 같은 폴더 flow.js·index.js가 씀 (시험이 토큰·프로필 주소로 가짜 fetch를 나눔)

// 로그인 화면으로 보낼 인가 주소
const GOOGLE_AUTH_ENDPOINT      = "https://accounts.google.com/o/oauth2/v2/auth";

// 인가 코드를 access 토큰으로 바꾸는 주소
const GOOGLE_TOKEN_ENDPOINT     = "https://oauth2.googleapis.com/token";

// access 토큰으로 프로필 받는 주소
const GOOGLE_USERINFO_ENDPOINT  = "https://openidconnect.googleapis.com/v1/userinfo";

exports.GOOGLE_TOKEN_ENDPOINT = GOOGLE_TOKEN_ENDPOINT;

exports.GOOGLE_USERINFO_ENDPOINT = GOOGLE_USERINFO_ENDPOINT;

exports.GOOGLE_AUTH_ENDPOINT = GOOGLE_AUTH_ENDPOINT;
