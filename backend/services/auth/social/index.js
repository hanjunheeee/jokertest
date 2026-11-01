// 소셜 로그인 입구, 옛 socialAuth.service와 같은 이름만 골라 내보냄
// 인증 컨트롤러가 이 입구로 부름 (자기 부르기도 이 입구 객체로)
const { issueOAuthState, consumeOAuthState } = require('./state');
const { resolveOAuthAccount, handleOAuthCallback } = require('./resolve');
const { getSocialSignupIntent, completeSocialSignup } = require('./signup');
const { linkExternalIdentityForValidatedSession, linkExternalIdentity } = require('./link');

module.exports = {
    issueOAuthState,
    consumeOAuthState,
    resolveOAuthAccount,
    getSocialSignupIntent,
    handleOAuthCallback,
    completeSocialSignup,
    linkExternalIdentityForValidatedSession,
    linkExternalIdentity,
};
