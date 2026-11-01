// 소셜 로그인 입구, 옛 socialAuth.service와 같은 이름만 골라 내보냄
// 인증 컨트롤러가 이 입구로 부름 (자기 부르기도 이 입구 객체로)
const { issueOAuthState, consumeOAuthState } = require('./state');
const { resolveOAuthAccount, handleOAuthCallback } = require('./resolve');
const { getSocialSignupIntent, completeSocialSignup } = require('./signup');
const { linkExternalIdentityForValidatedSession, linkExternalIdentity } = require('./link');
// 컨트롤러에서 옮긴 시도 표 서명·확인·판정 + 시도 표 유효 시간
const { signOAuthAttempt, verifyOAuthAttempt, rememberMeForSignup } = require('./attempt');
const { ATTEMPT_TTL_SECONDS, INTENT_TTL_SECONDS } = require('./constants');
// 컨트롤러에서 옮긴 구글·디스코드 로그인 흐름 · 디스코드 연결 흐름
const { startGoogleLogin, completeGoogleLogin } = require('./googleLogin');
const { startDiscordLogin, completeDiscordLogin } = require('./discordLogin');
const { startDiscordLink, completeDiscordLink } = require('./discordLink');

module.exports = {
    issueOAuthState,
    consumeOAuthState,
    resolveOAuthAccount,
    getSocialSignupIntent,
    handleOAuthCallback,
    completeSocialSignup,
    linkExternalIdentityForValidatedSession,
    linkExternalIdentity,
    signOAuthAttempt,
    verifyOAuthAttempt,
    rememberMeForSignup,
    ATTEMPT_TTL_SECONDS,
    INTENT_TTL_SECONDS,
    startGoogleLogin,
    completeGoogleLogin,
    startDiscordLogin,
    completeDiscordLogin,
    startDiscordLink,
    completeDiscordLink,
};
