// Discord OAuth 주소 상수 파일, 인가·토큰·프로필 주소
// 같은 폴더 flow.js·index.js가 씀 (시험이 토큰·프로필 주소로 가짜 fetch를 나눔)
const { getOAuthTestBaseUrl } = require("../../../../config/e2eHooks");

// 브라우저 시험 가짜 제공자 주소 (E2E_HOOKS=1이고 DISCORD_OAUTH_BASE_URL 있을 때만, 운영이면 시작 거부), 없으면 null
const TEST_BASE = getOAuthTestBaseUrl("DISCORD_OAUTH_BASE_URL");

// 로그인 화면으로 보낼 인가 주소
const DISCORD_AUTH_ENDPOINT     = TEST_BASE ? `${TEST_BASE}/api/oauth2/authorize` : "https://discord.com/api/oauth2/authorize";

// 인가 코드를 access 토큰으로 바꾸는 주소
const DISCORD_TOKEN_ENDPOINT    = TEST_BASE ? `${TEST_BASE}/api/oauth2/token` : "https://discord.com/api/oauth2/token";

// access 토큰으로 프로필 받는 주소
const DISCORD_USERINFO_ENDPOINT = TEST_BASE ? `${TEST_BASE}/api/users/@me` : "https://discord.com/api/users/@me";

exports.DISCORD_TOKEN_ENDPOINT = DISCORD_TOKEN_ENDPOINT;

exports.DISCORD_USERINFO_ENDPOINT = DISCORD_USERINFO_ENDPOINT;

exports.DISCORD_AUTH_ENDPOINT = DISCORD_AUTH_ENDPOINT;
