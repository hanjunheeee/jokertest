'use strict';

// OTP 앱 번호 파일, RFC 6238(SHA-1·30초·6자리) 계산·확인 + 새 비밀·otpauth 주소 만들기
// 관리자 로그인(login.js)·계정 명령(admin-account.js)이 씀, 설치 없이 Node crypto로 직접
const crypto = require('node:crypto');

const STEP_SEC = 30;
const DIGITS = 6;
// 앞뒤 한 칸(30초)까지 받음 (폰 시계가 조금 틀려도)
const WINDOW = 1;
const SECRET_BYTES = 20;
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

// 바이트 → base32 글자 (OTP 앱에 넣는 모양, 끝 = 없음)
const base32Encode = (bytes) => {
    let bits = 0;
    let value = 0;
    let out = '';
    for (const byte of bytes) {
        value = (value << 8) | byte;
        bits += 8;
        while (bits >= 5) {
            out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
            bits -= 5;
        }
    }
    if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
    return out;
};

// base32 글자 → 바이트 (빈칸·= 무시, 모르는 글자면 던짐)
const base32Decode = (text) => {
    const clean = String(text).toUpperCase().replace(/[\s=]/g, '');
    let bits = 0;
    let value = 0;
    const out = [];
    for (const char of clean) {
        const index = BASE32_ALPHABET.indexOf(char);
        if (index < 0) throw new Error('base32 글자가 아님');
        value = (value << 5) | index;
        bits += 5;
        if (bits >= 8) {
            out.push((value >>> (bits - 8)) & 255);
            bits -= 8;
        }
    }
    return Buffer.from(out);
};

// 칸 번호 하나의 6자리 번호 (RFC 4226 HOTP)
const hotp = (key, counter) => {
    const message = Buffer.alloc(8);
    message.writeBigUInt64BE(BigInt(counter));
    const digest = crypto.createHmac('sha1', key).update(message).digest();
    const offset = digest[digest.length - 1] & 0x0f;
    const number = digest.readUInt32BE(offset) & 0x7fffffff;
    return String(number % 10 ** DIGITS).padStart(DIGITS, '0');
};

const stepAt = (nowMs) => Math.floor(nowMs / 1000 / STEP_SEC);

// 그 시각 번호 (시험·계정 명령 확인용)
const codeAt = (secret, nowMs) => hotp(base32Decode(secret), stepAt(nowMs));

// 맞으면 맞은 칸 번호, 아니면 null
// lastStep 이하 칸은 안 봄 → 한 번 쓴 번호(와 그 앞 번호)는 다시 못 씀
const verifyTotp = ({ secret, code, nowMs = Date.now(), lastStep = null }) => {
    if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return null;
    const key = base32Decode(secret);
    const current = stepAt(nowMs);
    const given = Buffer.from(code);
    for (let step = current - WINDOW; step <= current + WINDOW; step += 1) {
        if (lastStep !== null && step <= Number(lastStep)) continue;
        if (crypto.timingSafeEqual(Buffer.from(hotp(key, step)), given)) return step;
    }
    return null;
};

// 새 비밀 (20바이트 → base32 32자)
const generateSecret = () => base32Encode(crypto.randomBytes(SECRET_BYTES));

// OTP 앱에 넣는 주소 (예: otpauth://totp/MMC%20관리자:boss?secret=…&issuer=…)
const otpauthUrl = ({ secret, account, issuer }) => {
    const label = encodeURIComponent(`${issuer}:${account}`);
    const query = new URLSearchParams({ secret, issuer, algorithm: 'SHA1', digits: String(DIGITS), period: String(STEP_SEC) });
    return `otpauth://totp/${label}?${query.toString()}`;
};

module.exports = { base32Encode, base32Decode, codeAt, verifyTotp, generateSecret, otpauthUrl, stepAt };
