'use strict';

// 가입 인증 코드 파일, 숫자 코드·증명 만들기 + HMAC 해시
// 원래 값은 저장 안 하고 해시만 저장 (세대 번호를 섞어 옛 코드 무효)
const crypto = require('crypto');

// 라벨·값 묶어 HMAC 16진수
const hmacHex = (secret, label, parts) => (
    crypto.createHmac('sha256', secret).update(`${label}:${parts.join(':')}`).digest('hex')
);

// 이메일·세대·코드로 코드 해시
const hashCode = (email, generation, code, secret) => hmacHex(secret, 'signup-code-v1', [email, String(generation), code]);

// 이메일·세대·증명으로 증명 해시
const hashProof = (email, generation, proof, secret) => hmacHex(secret, 'signup-proof-v1', [email, String(generation), proof]);

// 자리 수 맞춘 숫자 코드 (부를 때 crypto.randomInt)
const generateNumericCode = (length) => {
    const max = 10 ** length;
    const value = crypto.randomInt(0, max);
    return String(value).padStart(length, '0');
};

// 가입 때 낼 증명 값
const generateProof = () => crypto.randomBytes(32).toString('base64url');

module.exports = {
    hashCode,
    hashProof,
    generateNumericCode,
    generateProof,
};
