'use strict';

// 가입 이메일 인증 입구, 옛 signupEmailVerification.service와 같은 이름만 골라 내보냄
// 컨트롤러·가입·소셜 가입이 이 입구로 부름 (시험이 consumeSignupProof를 이 객체에서 갈아끼움)
const { requestSignupCode } = require('./request');
const { verifySignupCode, consumeSignupProof } = require('./verify');
const { PURPOSE } = require('./constants');
const { __testables } = require('./testing');

module.exports = {
    requestSignupCode,
    verifySignupCode,
    consumeSignupProof,
    PURPOSE,
    __testables,
};
