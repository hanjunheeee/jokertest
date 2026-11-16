'use strict';

// 꼭 있어야 하는 환경값 시험 — 빠진 값 이름 찾기(값 글자는 안 샘), 서명 키 약함(32자 미만·예시 모양), 시작 거부할 오류인지, 운영 주소인데 개발 값이면 거부
// 목록 A18-B-019~029·047~056 (docs/게임_의도_2026-11-15/시험목록/A18-설정-배포-광고.md), 돌리기: node --env-file=.env.test --test tests/unit/a18-required-env.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { findMissingEnv, assertRequiredEnv, findWeakSecrets, isStartupFatal } = require('../../config/requiredEnv');

// 누가 봐도 가짜인 값 (fake로 시작 + 무작위), 길이 정확히 맞춤
const fakeText = (length) => `fake${crypto.randomBytes(length).toString('hex')}`.slice(0, length);

// 셋 다 있는 가짜 환경값 (값마다 글자가 달라 오류 글에 새는지 볼 수 있음)
const fullEnv = () => ({
    NODE_ENV: 'development',
    DATABASE_URL: `mysql://fakeuser:${fakeText(20)}@db.example.test:3306/fake_db`,
    JWT_SECRET: fakeText(48),
    FRONTEND_URL: 'https://front-a18.example.test',
});

// 오류 글 받기 (안 던지면 null)
const errorOf = (fn) => {
    try { fn(); return null; } catch (error) { return error; }
};

// ── 019~022: 빠진 값 찾기 ──
test('A18-B-019 셋 다 있음 → 빠진 값 빈 목록, 오류 없음', () => {
    const env = fullEnv();
    assert.deepEqual(findMissingEnv(env), []);
    assert.equal(errorOf(() => assertRequiredEnv(env)), null);
});

[
    ['020', 'DATABASE_URL', undefined, '없음'],
    ['021', 'JWT_SECRET', '   ', '공백만'],
    ['022', 'FRONTEND_URL', '', '빈 글자'],
].forEach(([no, key, value, label]) => {
    test(`A18-B-${no} ${key} ${label} → ["${key}"], 오류 글엔 이름만·다른 칸 값 글자 없음`, () => {
        const env = fullEnv();
        if (value === undefined) delete env[key];
        else env[key] = value;
        assert.deepEqual(findMissingEnv(env), [key]);
        const error = errorOf(() => assertRequiredEnv(env));
        assert.ok(error, '오류가 안 남');
        assert.match(error.message, new RegExp(key));
        for (const [other, text] of Object.entries(env)) {
            if (other === key || other === 'NODE_ENV' || !text.trim()) continue;
            assert.equal(error.message.includes(text), false, `오류 글에 ${other} 값이 샘`);
        }
    });
});

// ── 023~026: 서명 키가 약한지 ──
[
    ['023', '무작위 31자', fakeText(31), ['JWT_SECRET']],
    ['024', '무작위 32자', fakeText(32), []],
    ['025', 'change-me로 시작하는 40자', `change-me-${fakeText(30)}`, ['JWT_SECRET']],
    ['026', '빈 값', '', []],
].forEach(([no, label, value, expected]) => {
    test(`A18-B-${no} JWT_SECRET ${label} → 약함 목록 ${JSON.stringify(expected)}`, () => {
        if (no === '025') assert.equal(value.length, 40);
        assert.deepEqual(findWeakSecrets({ JWT_SECRET: value }), expected);
    });
});

// ── 027~029: 시작 거부할 오류인지 (시작 파일과 같은 순서: 검사 → 던진 오류로 판정) ──
test('A18-B-027 운영 + 필수 값 빠짐 → 시작 거부', () => {
    const env = { ...fullEnv(), NODE_ENV: 'production' };
    delete env.JWT_SECRET;
    const error = errorOf(() => assertRequiredEnv(env));
    assert.ok(error);
    assert.equal(isStartupFatal(error, env), true);
});

test('A18-B-028 개발 + 필수 값 빠짐 → 거부 아님 (경고만)', () => {
    const env = fullEnv();
    delete env.DATABASE_URL;
    const error = errorOf(() => assertRequiredEnv(env));
    assert.ok(error, '빠진 값 오류는 나야 함 (경고 글감)');
    assert.equal(isStartupFatal(error, env), false);
});

test('A18-B-029 개발 쪽 + NODE_ENV 오타(developmnet) → 시작 거부', () => {
    const env = { ...fullEnv(), NODE_ENV: 'developmnet' };
    const error = errorOf(() => assertRequiredEnv(env));
    assert.ok(error);
    assert.equal(isStartupFatal(error, env), true);
});

// ── 047~056: 운영 주소(https + 진짜 도메인)인데 NODE_ENV가 production이 아니면 시작 거부 (결정 2026-11-16 아침 17번) ──
// 운영 주소 본보기는 예약된 도메인(example.com), 개발·시험 주소는 localhost·IP·.test
const PUBLIC_HTTPS = 'https://play.example.com';

[
    ['047', 'development', '개발'],
    ['048', '', '빈 글자'],
    ['049', 'test', '시험'],
].forEach(([no, nodeEnv, label]) => {
    test(`A18-B-${no} NODE_ENV ${label} + FRONTEND_URL 운영 주소(https 도메인) → 시작 거부, 오류 글엔 이름만`, () => {
        const env = { ...fullEnv(), NODE_ENV: nodeEnv, FRONTEND_URL: PUBLIC_HTTPS };
        const error = errorOf(() => assertRequiredEnv(env));
        assert.ok(error, '오류가 안 남');
        assert.equal(isStartupFatal(error, env), true);
        assert.match(error.message, /NODE_ENV/);
        assert.match(error.message, /FRONTEND_URL/);
        assert.equal(error.message.includes('play.example.com'), false, '오류 글에 주소 값이 샘');
    });
});

test('A18-B-050 NODE_ENV production + FRONTEND_URL 운영 주소 → 오류 없음', () => {
    const env = { ...fullEnv(), NODE_ENV: 'production', FRONTEND_URL: PUBLIC_HTTPS };
    assert.equal(errorOf(() => assertRequiredEnv(env)), null);
});

[
    ['051', 'http://localhost:5173', 'http localhost'],
    ['052', 'https://localhost:5173', 'https localhost'],
    ['053', 'https://192.168.0.10:5173', 'https 안쪽 IP'],
    ['054', 'https://front-a18.example.test', 'https .test 도메인'],
    ['055', 'http://play.example.com', 'http 도메인'],
].forEach(([no, url, label]) => {
    test(`A18-B-${no} NODE_ENV development + FRONTEND_URL ${label} → 오류 없음 (개발·시험은 그대로 켜짐)`, () => {
        const env = { ...fullEnv(), NODE_ENV: 'development', FRONTEND_URL: url };
        assert.equal(errorOf(() => assertRequiredEnv(env)), null);
    });
});

test('A18-B-056 개발 + 운영 주소 + JWT_SECRET 없음 → 빠진 값 경고로 안 덮이고 시작 거부', () => {
    const env = { ...fullEnv(), NODE_ENV: 'development', FRONTEND_URL: PUBLIC_HTTPS };
    delete env.JWT_SECRET;
    const error = errorOf(() => assertRequiredEnv(env));
    assert.ok(error);
    assert.equal(isStartupFatal(error, env), true);
});
