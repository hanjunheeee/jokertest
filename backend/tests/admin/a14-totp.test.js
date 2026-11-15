'use strict';

// 관리자 OTP 번호 시험: 표준(RFC 6238) 시험 값과 같은지 + 앞뒤 한 칸(30초)만 받는지
// 목록 docs/게임_의도_2026-11-15/시험목록/A14-관리자.md A14-B-001~011 (돌리기: node --env-file=.env.test --test)
const test = require('node:test');
const assert = require('node:assert/strict');

const totp = require('../../admin/services/core/totp');

// RFC 6238 부록 B의 SHA-1 시험 비밀 "12345678901234567890" (글자 그대로를 base32로)
const RFC_SECRET = totp.base32Encode(Buffer.from('12345678901234567890', 'ascii'));

// 표준 표의 8자리 값 → 뒤 6자리가 우리 번호
const RFC_VECTORS = [
    ['001', 59, '94287082'],
    ['002', 1111111109, '07081804'],
    ['003', 1111111111, '14050471'],
    ['004', 1234567890, '89005924'],
    ['005', 2000000000, '69279037'],
    ['006', 20000000000, '65353130'],
];

for (const [no, sec, eight] of RFC_VECTORS) {
    test(`A14-B-${no} OTP 표준 값: 시각 ${sec}초 → ${eight.slice(2)}`, () => {
        assert.equal(totp.codeAt(RFC_SECRET, sec * 1000), eight.slice(2));
    });
}

// 고정 시각 (칸 가운데쯤, 진짜 시계 안 씀)
const BASE_MS = 1_700_000_015_000;
const SECRET = totp.base32Encode(Buffer.from('a14-gate-fake-otp-seed', 'ascii'));
const CODE = totp.codeAt(SECRET, BASE_MS);

const WINDOW_CASES = [
    ['007', -61, false],
    ['008', -30, true],
    ['009', 0, true],
    ['010', 30, true],
    ['011', 61, false],
];

for (const [no, offsetSec, ok] of WINDOW_CASES) {
    test(`A14-B-${no} 지금 칸 번호를 ${offsetSec >= 0 ? '+' : ''}${offsetSec}초에 넣음 → ${ok ? '맞음' : '틀림'}`, () => {
        const matched = totp.verifyTotp({ secret: SECRET, code: CODE, nowMs: BASE_MS + offsetSec * 1000 });
        assert.equal(matched !== null, ok);
    });
}
