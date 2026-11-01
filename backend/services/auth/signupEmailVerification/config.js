'use strict';

// 가입 이메일 인증 설정 파일, 환경 설정 읽기 · 비밀 키 확인
// 보내기·확인·증명 소비가 부를 때마다 읽음
const { createError } = require('../../../utils/appError');
const { getSignupEmailVerificationConfig } = require('../../../config/signupEmailVerification');

// HMAC 비밀 키 없으면 500 (코드·증명을 해시할 수 없으므로)
const requireConfig = () => {
    const config = getSignupEmailVerificationConfig(process.env);
    if (!config.hmacSecret) {
        throw createError('가입 이메일 인증 설정이 올바르지 않습니다.', 500, 'SIGNUP_EMAIL_CONFIG_INVALID');
    }
    return config;
};

module.exports = {
    requireConfig,
};
