// Google OAuth 입구, 인가 주소 만들기·코드 교환 + 토큰·프로필 주소(시험이 가짜 fetch 나눌 때 씀)
// controllers/auth/google.js·social/googleLogin.js가 부름
const { GOOGLE_TOKEN_ENDPOINT, GOOGLE_USERINFO_ENDPOINT } = require('./constants');
const { buildAuthorizationUrl, exchangeCodeForProfile } = require('./flow');

module.exports = {
    GOOGLE_TOKEN_ENDPOINT,
    GOOGLE_USERINFO_ENDPOINT,
    buildAuthorizationUrl,
    exchangeCodeForProfile,
};
