// Discord OAuth 주소 상수 파일, 인가·토큰·프로필 주소
// 시험이 토큰·프로필 주소로 가짜 fetch를 나눔

// 로그인 화면으로 보낼 인가 주소
const DISCORD_AUTH_ENDPOINT     = "https://discord.com/api/oauth2/authorize";

const DISCORD_TOKEN_ENDPOINT    = "https://discord.com/api/oauth2/token";

const DISCORD_USERINFO_ENDPOINT = "https://discord.com/api/users/@me";

exports.DISCORD_TOKEN_ENDPOINT = DISCORD_TOKEN_ENDPOINT;

exports.DISCORD_USERINFO_ENDPOINT = DISCORD_USERINFO_ENDPOINT;

exports.DISCORD_AUTH_ENDPOINT = DISCORD_AUTH_ENDPOINT;
