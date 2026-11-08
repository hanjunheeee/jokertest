// 소셜 로그인 입구, state·계정 찾기·소셜 가입·연결·시도 표·돌아갈 프런트 주소·구글·디스코드 흐름 묶어 내보냄
// controllers/auth/google.js·discord.js·discordLink.js·socialSignup.js가 부름 (같은 폴더 파일은 원래 파일 모듈 객체로 부름)
// 시험이 issueOAuthState·consumeOAuthState·resolveOAuthAccount·linkExternalIdentityForValidatedSession을 이 객체에서 갈아끼움
// 시험이 갈아끼우는 넷은 원래 파일 값으로 이어 둠 (같은 폴더 파일이 입구 말고 원래 파일로 불러도 패치 먹게, 순환 require 없음)
const stateModule = require('./state');
const resolveModule = require('./resolve');
const linkModule = require('./link');
const { forwardExports } = require('../../../utils/forwardExports');
const { handleOAuthCallback } = resolveModule;
const { getSocialSignupIntent, completeSocialSignup } = require('./signup');
const { linkExternalIdentity } = require('./link');
// 시도 표 서명·확인·판정 + 시도 표 유효 시간 (컨트롤러 쿠키가 씀)
const { signOAuthAttempt, verifyOAuthAttempt, rememberMeForSignup, isSignupAttemptFor } = require('./attempt');
const { ATTEMPT_TTL_SECONDS, INTENT_TTL_SECONDS } = require('./constants');
// 시작한 기기(client) 판정 · 콜백 뒤 돌아갈 프런트 주소 (컨트롤러가 config 직접 안 부르게)
const { parseClient, resolveFrontendBase } = require('../../../config/frontendOrigins');
// 구글·디스코드 로그인 흐름 · 디스코드 연결 흐름
const { startGoogleLogin, completeGoogleLogin } = require('./googleLogin');
const { startDiscordLogin, completeDiscordLogin } = require('./discordLogin');
const { startDiscordLink, completeDiscordLink } = require('./discordLink');

module.exports = {
    getSocialSignupIntent,
    handleOAuthCallback,
    completeSocialSignup,
    linkExternalIdentity,
    signOAuthAttempt,
    verifyOAuthAttempt,
    rememberMeForSignup,
    isSignupAttemptFor,
    ATTEMPT_TTL_SECONDS,
    INTENT_TTL_SECONDS,
    parseClient,
    resolveFrontendBase,
    startGoogleLogin,
    completeGoogleLogin,
    startDiscordLogin,
    completeDiscordLogin,
    startDiscordLink,
    completeDiscordLink,
};
forwardExports(module.exports, stateModule, ['issueOAuthState', 'consumeOAuthState']);
forwardExports(module.exports, resolveModule, ['resolveOAuthAccount']);
forwardExports(module.exports, linkModule, ['linkExternalIdentityForValidatedSession']);
