'use strict';

// 비밀번호 재설정 토큰 파일, 토큰 만들기 · 해시 · 재설정 주소
// 원래 토큰은 메일 주소에만, DB엔 해시만
const crypto = require('crypto');

// 메일로 보낼 원래 토큰
const generateRawToken = () => crypto.randomBytes(32).toString('base64url');

// DB에 넣을 토큰 해시
const hashToken = (raw) => crypto.createHash('sha256').update(raw).digest('hex');

// 앱 주소가 없거나 http(s) 아니면 null (메일 안 보냄)
const buildResetUrl = (rawToken) => {
    const base = process.env.PASSWORD_RESET_APP_URL;
    if (typeof base !== 'string' || !base.trim()) return null;

    let target;
    try {
        target = new URL(base.trim());
    } catch {
        return null;
    }
    if (target.protocol !== 'http:' && target.protocol !== 'https:') return null;

    target.pathname = `${target.pathname.replace(/\/+$/, '')}/password-reset`;
    target.search = '';
    target.searchParams.set('token', rawToken);
    return target.toString();
};

module.exports = {
    generateRawToken,
    hashToken,
    buildResetUrl,
};
