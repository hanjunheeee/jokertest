'use strict';

// OTP 비밀 잠금 파일, AES-256-GCM으로 잠그고 풀기 (모양 v1:<iv>:<tag>:<암호문>, base64url)
// 관리자 로그인(login.js)·계정 명령이 씀, 열쇠는 ADMIN_TOTP_KEY(32바이트) → DB가 새도 OTP 비밀은 안 보임
const crypto = require('node:crypto');

const VERSION = 'v1';
const IV_BYTES = 12;
const KEY_BYTES = 32;

const assertKey = (key) => {
    if (!Buffer.isBuffer(key) || key.length !== KEY_BYTES) throw new Error('잠금 열쇠는 32바이트여야 함');
};

// 글자 잠그기 (잠글 때마다 iv가 달라 결과도 다름)
const seal = (plainText, key) => {
    assertKey(key);
    const iv = crypto.randomBytes(IV_BYTES);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const body = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [VERSION, iv.toString('base64url'), tag.toString('base64url'), body.toString('base64url')].join(':');
};

// 풀기 (다른 열쇠·고친 암호문·모양 틀림이면 던짐)
const open = (sealed, key) => {
    assertKey(key);
    const parts = String(sealed).split(':');
    if (parts.length !== 4 || parts[0] !== VERSION) throw new Error('잠근 모양이 아님');
    const [, iv, tag, body] = parts.map((part) => Buffer.from(part, 'base64url'));
    if (iv.length !== IV_BYTES || tag.length !== 16) throw new Error('잠근 모양이 아님');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
};

module.exports = { seal, open };
