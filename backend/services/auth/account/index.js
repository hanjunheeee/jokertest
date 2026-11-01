// 이메일·비번 계정 입구, 옛 auth.service와 같은 이름만 골라 내보냄
// 인증 컨트롤러·소셜 로그인이 이 입구로 부름 (시험이 issueSessionForUser·signup을 이 객체에서 갈아끼움)
const { issueSessionForUser } = require('./session');
const { signup, checkEmailAvailability } = require('./signup');
const { login } = require('./login');
const { refresh } = require('./refresh');

module.exports = {
    issueSessionForUser,
    signup,
    checkEmailAvailability,
    login,
    refresh,
};
