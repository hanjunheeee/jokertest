'use strict';

// 이메일 가리기 파일, 아이디 찾기 결과로 보여 줄 가린 이메일 (예: a***z@g***.com)
// 아이디 찾기 서비스(services/auth/accountRecovery.js)가 부름

// 가릴 수 없는 값이면 이 문구 (원문을 그대로 내보내지 않게)
const FALLBACK_MASK = '비공개';

// @ 앞: 첫 글자·끝 글자만 남김 (짧으면 더 가림)
const maskLocalPart = (local) => {
    if (local.length === 1) return '*';
    if (local.length === 2) return `${local[0]}*`;
    return `${local[0]}***${local[local.length - 1]}`;
};

// @ 뒤: 첫 글자 + 마지막 점 뒤(.com 등)만 남김, 점이 없거나 이상하면 첫 글자만
const maskDomain = (domain) => {
    const lastDotIndex = domain.lastIndexOf('.');
    if (lastDotIndex <= 0 || lastDotIndex === domain.length - 1) {
        return `${domain[0]}***`;
    }
    const topLevel = domain.slice(lastDotIndex);
    return `${domain[0]}***${topLevel}`;
};

// 이메일 모양 확인 → 앞·뒤 가리기, 가린 결과가 원문과 같으면 대체 문구
const maskEmail = (email) => {
    if (typeof email !== 'string') return FALLBACK_MASK;

    // @가 맨 앞·맨 끝이거나 없으면 이메일 아님
    const atIndex = email.indexOf('@');
    if (atIndex <= 0 || atIndex === email.length - 1) return FALLBACK_MASK;

    const local = email.slice(0, atIndex);
    const domain = email.slice(atIndex + 1);
    if (!local || !domain) return FALLBACK_MASK;

    const masked = `${maskLocalPart(local)}@${maskDomain(domain)}`;
    if (masked === email) return FALLBACK_MASK;
    return masked;
};

module.exports = { maskEmail, FALLBACK_MASK };
