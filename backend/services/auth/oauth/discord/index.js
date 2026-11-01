// Discord OAuth 입구, 옛 discordOAuth.service와 같은 이름만 골라 내보냄
// 인증 컨트롤러·소셜 로그인 흐름이 이 입구로 부름
const { DISCORD_TOKEN_ENDPOINT, DISCORD_USERINFO_ENDPOINT } = require('./constants');
const { buildAuthorizationUrl, exchangeCodeForProfile } = require('./flow');

module.exports = {
    DISCORD_TOKEN_ENDPOINT,
    DISCORD_USERINFO_ENDPOINT,
    buildAuthorizationUrl,
    exchangeCodeForProfile,
};
