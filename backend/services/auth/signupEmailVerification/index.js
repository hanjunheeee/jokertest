'use strict';

// 가입 이메일 인증 입구, 코드 보내기·확인·증명 소비 + 목적 값·시험 손잡이 내보냄
// controllers/auth/signupEmailVerification.js, account/signup.js·social/signup.js, 같은 폴더 request.js(다시 부르기)가 부름
// 시험이 consumeSignupProof를 이 객체에서 갈아끼우기 때문에 입구 남김 (PURPOSE·__testables는 지금 쓰는 곳 없음)
// requestSignupCode는 request.js 값으로 이어 둠 (request.js가 자기 다시 부르기를 입구 없이 해도 패치 먹게)
const requestModule = require('./request');
const { forwardExports } = require('../../../utils/forwardExports');
const { verifySignupCode, consumeSignupProof } = require('./verify');
const { PURPOSE } = require('./config');
const { __testables } = require('./testing');

module.exports = {
    verifySignupCode,
    consumeSignupProof,
    PURPOSE,
    __testables,
};
forwardExports(module.exports, requestModule, ['requestSignupCode']);
