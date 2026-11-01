'use strict';

// 가입 이메일 인증 입구, 코드 보내기·확인·증명 소비 + 목적 값·시험 손잡이 내보냄
// controllers/auth/signupEmailVerification.js, account/signup.js·social/signup.js, 같은 폴더 request.js(다시 부르기)가 부름
// 시험이 consumeSignupProof를 이 객체에서 갈아끼우기 때문에 입구 남김 (PURPOSE·__testables는 지금 쓰는 곳 없음)
const { requestSignupCode } = require('./request');
const { verifySignupCode, consumeSignupProof } = require('./verify');
const { PURPOSE } = require('./config');
const { __testables } = require('./testing');

module.exports = {
    requestSignupCode,
    verifySignupCode,
    consumeSignupProof,
    PURPOSE,
    __testables,
};
