'use strict';

// 이메일 바꾸기 인증번호 파일, 목적 값 · 요청한 사람에 묶인 번호 해시 · 새 주소 검사·가리기
// 같은 폴더 request.js·confirm.js가 씀 (번호 만들기·설정은 가입 인증 것을 다시 씀)
const crypto = require('crypto');
const { normalizeEmail, validateEmailFormat } = require('../../../validations/auth/signupEmailVerification');

// 인증 행 목적 값 (가입 인증 행과 안 섞이게)
const PURPOSE = 'EMAIL_CHANGE';

// uuid·새 주소·세대·번호로 해시 (같은 새 주소를 다른 사람이 요청해도 내 번호로 못 바꿈)
const hashChangeCode = ({ uuid, email, generation, code }, secret) => crypto
    .createHmac('sha256', secret)
    .update(`email-change-code-v1:${uuid}:${email}:${generation}:${code}`)
    .digest('hex');

// 새 주소: 가입 모양 검사 + 쉼표·@ 두 개 거절 (한 번에 여러 곳 보내기 막기), 맞으면 소문자 주소
const parseNewEmail = (value) => {
    if (!validateEmailFormat(value)) return null;
    const email = normalizeEmail(value);
    if (email.includes(',') || email.split('@').length !== 2) return null;
    return email;
};

// 알림 메일용 가린 주소 (예: abcdef@gmail.com → ab****@gmail.com)
const maskEmail = (email) => {
    const [local, domain] = String(email).split('@');
    if (!domain) return '***';
    return `${local.slice(0, 2)}${'*'.repeat(Math.max(2, local.length - 2))}@${domain}`;
};

module.exports = {
    PURPOSE,
    hashChangeCode,
    parseNewEmail,
    maskEmail,
};
