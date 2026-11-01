'use strict';

// 비밀번호 재설정 입구, 옛 passwordReset.service와 같은 이름만 골라 내보냄
// 비밀번호 재설정 컨트롤러가 이 입구로 부름
const { requestPasswordReset } = require('./request');
const { verifyPasswordReset, confirmPasswordReset } = require('./confirm');
const { TOKEN_TTL_MS } = require('./constants');
const { __testables } = require('./testing');

module.exports = {
    requestPasswordReset,
    verifyPasswordReset,
    confirmPasswordReset,
    TOKEN_TTL_MS,
    __testables,
};
