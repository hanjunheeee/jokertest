'use strict';

// 운영 값이 틀리면 서버가 안 켜지는지 브라우저 묶음 시험 — 따로 띄운 백엔드(4150+)가 종료 코드 1로 꺼지고 출력에 그 값 이름이 남음
// 목록 A18-설정-배포-광고.md 번호 A18-E-001·002 (본 시험 서버와 따로라 @serial 아님), 돌리지 않고 모임만: npx playwright test --list --no-deps tests/maintenance/a18-startup-refuse.spec.js
const crypto = require('node:crypto');
const { test, expect } = require('../../helpers/fixtures');
const { startExtraBackend } = require('../../helpers/servers');

// 시험 안에서 만든 가짜 서명 키 (무작위 48자) — 약한 키 검사에 먼저 걸리지 않게
const fakeSecret = () => crypto.randomBytes(24).toString('hex');

// 운영 값 바탕: 서명 키는 가짜 강한 값, 시험 전용 값(메일 파일 받는 곳·꺼짐 깃발)은 뺌 → 케이스마다 한 칸만 틀리게
const prodBase = () => ({
    NODE_ENV: 'production',
    JWT_SECRET: fakeSecret(),
    SIGNUP_EMAIL_HMAC_SECRET: fakeSecret(),
    E2E_HOOKS: undefined,
    MAIL_TEST_OUTBOX_DIR: undefined,
    E2E_SHUTDOWN_FLAG: undefined,
});

test('A18-E-001 운영 값 + E2E_HOOKS=1 → 종료 코드 1, 출력에 E2E_HOOKS 이름 @smoke', async () => {
    const base = prodBase();
    const r = await startExtraBackend({ expectExit: true, overrides: { ...base, E2E_HOOKS: '1' } });
    expect(r.code, `종료 코드 (출력 끝: ${r.output.slice(-300)})`).toBe(1);
    expect(r.output).toContain('[STARTUP] 실패 — 환경값');
    expect(r.output).toContain('E2E_HOOKS');
    // 넣은 가짜 키 글자는 출력에 없음
    expect(r.output).not.toContain(base.JWT_SECRET);
});

test('A18-E-002 운영 값에서 FRONTEND_URL 뺌 → 종료 코드 1, 출력에 FRONTEND_URL 이름', async () => {
    const r = await startExtraBackend({ expectExit: true, overrides: { ...prodBase(), FRONTEND_URL: undefined } });
    expect(r.code, `종료 코드 (출력 끝: ${r.output.slice(-300)})`).toBe(1);
    expect(r.output).toContain('[STARTUP] 실패 — 환경값');
    expect(r.output).toContain('FRONTEND_URL');
});
