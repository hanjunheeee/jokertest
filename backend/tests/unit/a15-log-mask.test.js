'use strict';

// 로그 줄 비밀값 가리기 시험 — 비번·토큰·DB 주소 비번·안쪽 열쇠는 [REDACTED]로, 평범한 줄은 그대로
// 목록 A15-B-015~021 (docs/게임_의도_2026-11-15/시험목록/A15-보안.md), 돌리기: node --env-file=.env.test --test tests/unit/a15-log-mask.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const { maskSecrets } = require('../../utils/logFile');

// 시험 전용 가짜 비밀 글자 (진짜 값 아님)
const FAKE = 'a15FakeSecretValue7788';

// 가린 줄: [REDACTED] 들어 있고 원래 값 글자는 없어야 함
const assertMasked = (line, secret) => {
    const masked = maskSecrets(line);
    assert.match(masked, /\[REDACTED/, `안 가려짐: ${masked}`);
    assert.equal(masked.includes(secret), false, `원래 값이 남음: ${masked}`);
};

test('A15-B-015 password=… → 값 자리 가림', () => {
    assertMasked(`로그인 요청 password=${FAKE} 끝`, FAKE);
});

test('A15-B-016 JSON "token":"…" → 값 자리 가림', () => {
    assertMasked(`본문 {"token":"${FAKE}","ok":true}`, FAKE);
});

test('A15-B-017 Authorization: Bearer … → 값 자리 가림', () => {
    assertMasked(`헤더 Authorization: Bearer ${FAKE}`, FAKE);
});

test('A15-B-018 로그인 토큰(JWT) 모양 글 → 가림', () => {
    // 머리.몸통.서명 세 조각 모양만 흉내 (서명 안 된 가짜)
    const head = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify({ uuid: 'a15-user' })).toString('base64url');
    const jwtLike = `${head}.${body}.${FAKE}`;
    assertMasked(`쿠키 값 ${jwtLike} 받음`, jwtLike);
});

test('A15-B-019 DB 접속 주소 안 비번 → 가림', () => {
    assertMasked(`DB 연결 실패 mysql://a15user:${FAKE}@127.0.0.1:3306/a15db`, FAKE);
});

test('A15-B-020 x-internal-key: … → 가림', () => {
    assertMasked(`요청 머리말 x-internal-key: ${FAKE}`, FAKE);
});

test('A15-B-021 평범한 줄 "방 만들기 성공" → 그대로', () => {
    assert.equal(maskSecrets('방 만들기 성공'), '방 만들기 성공');
});
