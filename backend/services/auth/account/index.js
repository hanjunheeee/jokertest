// 이메일·비번 계정 입구, 세션 발급·가입·로그인·refresh·비번 바꾸기 묶어 내보냄
// controllers/auth/account.js·auth/session.js·profile.controller.js, social/resolve.js·social/signup.js, 같은 폴더 login.js가 부름
// 시험이 issueSessionForUser·signup을 이 객체에서 갈아끼우기 때문에 입구 남김
const { issueSessionForUser } = require('./session');
const { signup, checkEmailAvailability } = require('./signup');
const { login, logout } = require('./login');
const { refresh } = require('./refresh');
// 비번 바꾸기 (profile 컨트롤러가 씀)
const { changePassword } = require('./password');

module.exports = {
    issueSessionForUser,
    signup,
    checkEmailAvailability,
    login,
    refresh,
    logout,
    changePassword,
};
