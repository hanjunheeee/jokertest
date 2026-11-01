// 인증 컨트롤러 입구, 옛 user.controller 이름 + 비번 재설정·가입 이메일 인증·아이디 찾기 이름
// routes/auth.routes.js가 이 폴더 파일들을 부름
const { signup, checkEmail, login } = require('./account');
const { me, logout, refresh } = require('./session');
const { completeSocialSignup, getSocialSignupIntent } = require('./socialSignup');
const { googleAuthStart, googleAuthCallback } = require('./google');
const { discordAuthStart, discordAuthCallback } = require('./discord');
const { discordLinkStart, discordLinkCallback } = require('./discordLink');
// 비번 재설정·가입 이메일 인증·아이디 찾기 컨트롤러 이름도 모음 (이름 겹침 없음)
const passwordReset = require('./passwordReset');
const signupEmailVerification = require('./signupEmailVerification');
const accountRecovery = require('./accountRecovery');

module.exports = {
    signup,
    checkEmail,
    login,
    me,
    logout,
    completeSocialSignup,
    getSocialSignupIntent,
    googleAuthStart,
    googleAuthCallback,
    discordAuthStart,
    discordAuthCallback,
    discordLinkStart,
    discordLinkCallback,
    refresh,
    ...passwordReset,
    ...signupEmailVerification,
    ...accountRecovery,
};
