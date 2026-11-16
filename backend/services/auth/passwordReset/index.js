'use strict';

// 비밀번호 재설정 입구, 요청·링크 확인·새 비번 저장 + 시작 때 메일 설정 경고 글·유효 시간·시험 손잡이 내보냄
// controllers/auth/passwordReset.js가 부름 (TOKEN_TTL_MS·__testables는 지금 쓰는 곳 없음)
const { requestPasswordReset, describeMailWarning } = require('./request');
const { verifyPasswordReset, confirmPasswordReset } = require('./confirm');
const { TOKEN_TTL_MS } = require('./constants');
const { __testables } = require('./testing');

module.exports = {
    requestPasswordReset,
    verifyPasswordReset,
    confirmPasswordReset,
    describeMailWarning,
    TOKEN_TTL_MS,
    __testables,
};
