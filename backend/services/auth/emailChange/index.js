'use strict';

// 이메일 바꾸기 입구, 번호 보내기·확인 + 새 주소 검사·가리기 내보냄
// controllers/auth/emailChange.js가 이 객체로 부름 (시험이 함수를 갈아끼우기 때문에 입구 남김)
const { requestEmailChangeCode } = require('./request');
const { confirmEmailChange } = require('./confirm');
const { PURPOSE, parseNewEmail, maskEmail } = require('./codes');

module.exports = {
    requestEmailChangeCode,
    confirmEmailChange,
    PURPOSE,
    parseNewEmail,
    maskEmail,
};
