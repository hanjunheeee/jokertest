'use strict';

// 가입 이메일 인증 설정 파일, 인증 행 목적 값 · 환경 설정 읽기(비밀 키 확인)
// 보내기·확인·증명 소비가 부를 때마다 읽음, 목적 값은 다른 목적과 행 안 섞이게
const { createError } = require('../../../utils/appError');
const { getSignupEmailConfig } = require('../../../config/signupEmailVerification');

// 가입용 인증 행만 고르는 목적 값
const PURPOSE = 'SIGNUP';

// HMAC 비밀 키 없으면 500 (코드·증명을 해시할 수 없으므로)
const requireConfig = () => {
    const config = getSignupEmailConfig(process.env);
    if (!config.hmacSecret) {
        throw createError('가입 이메일 인증 설정이 올바르지 않습니다.', 500, 'SIGNUP_EMAIL_CONFIG_INVALID');
    }
    return config;
};

module.exports = {
    PURPOSE,
    requireConfig,
};
