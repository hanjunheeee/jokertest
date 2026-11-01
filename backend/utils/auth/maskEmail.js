'use strict';

const FALLBACK_MASK = '비공개';

const maskLocalPart = (local) => {
    if (local.length === 1) return '*';
    if (local.length === 2) return `${local[0]}*`;
    return `${local[0]}***${local[local.length - 1]}`;
};

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
    if (masked === email) return FALLBACK_MASK;
    return masked;
};

module.exports = { maskEmail, FALLBACK_MASK };
