'use strict';

// F-29a: 아이디 찾기 응답에 실어 보낼 이메일 힌트를 만든다. 전체 이메일을 절대 그대로
// 내보내지 않는다 — 로컬 부분 길이별로 다르게 가리고, 도메인은 첫 글자와 최상위 도메인만
// 남긴다(AC-01/AC-03).

const FALLBACK_MASK = '비공개';

const maskLocalPart = (local) => {
    if (local.length === 1) return '*';
    if (local.length === 2) return `${local[0]}*`;
    return `${local[0]}***${local[local.length - 1]}`;
};

// 도메인의 첫 글자와 마지막 점 이후(최상위 도메인)만 남긴다. 점이 없으면(형식이 이상한
// 도메인) 최상위 도메인을 표시할 수 없으므로 첫 글자만 남긴다.
const maskDomain = (domain) => {
    const lastDotIndex = domain.lastIndexOf('.');
    if (lastDotIndex <= 0 || lastDotIndex === domain.length - 1) {
        return `${domain[0]}***`;
    }
    const topLevel = domain.slice(lastDotIndex);
    return `${domain[0]}***${topLevel}`;
};

const maskEmail = (email) => {
    if (typeof email !== 'string') return FALLBACK_MASK;

    const atIndex = email.indexOf('@');
    if (atIndex <= 0 || atIndex === email.length - 1) return FALLBACK_MASK;

    const local = email.slice(0, atIndex);
    const domain = email.slice(atIndex + 1);
    if (!local || !domain) return FALLBACK_MASK;

    const masked = `${maskLocalPart(local)}@${maskDomain(domain)}`;
    // 극단적으로 짧은 입력에서 마스킹 결과가 원문과 똑같아지면(가려지는 부분이 없다는 뜻)
    // 원문 대신 고정된 비식별 표시를 돌려준다.
    if (masked === email) return FALLBACK_MASK;
    return masked;
};

module.exports = { maskEmail, FALLBACK_MASK };
