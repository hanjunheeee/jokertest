// Discord OAuth 주소 상수 파일, 인가·토큰·프로필 주소
// 같은 폴더 flow.js·index.js가 씀 (시험이 토큰·프로필 주소로 가짜 fetch를 나눔)

// 로그인 화면으로 보낼 인가 주소
const DISCORD_AUTH_ENDPOINT     = "https://discord.com/api/oauth2/authorize";

// 인가 코드를 access 토큰으로 바꾸는 주소
const DISCORD_TOKEN_ENDPOINT    = "https://discord.com/api/oauth2/token";

// access 토큰으로 프로필 받는 주소
const DISCORD_USERINFO_ENDPOINT = "https://discord.com/api/users/@me";

exports.DISCORD_TOKEN_ENDPOINT = DISCORD_TOKEN_ENDPOINT;

exports.DISCORD_USERINFO_ENDPOINT = DISCORD_USERINFO_ENDPOINT;

exports.DISCORD_AUTH_ENDPOINT = DISCORD_AUTH_ENDPOINT;
