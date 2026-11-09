'use strict';

// 실행 끝 정리 파일, 이번 실행(E2E_RUN_ID)에서 만든 계정만 지움 (서버는 그 뒤 Playwright가 끔)
// playwright.config.js globalTeardown, 남기고 싶으면 E2E_KEEP_ACCOUNTS=1 — 다 못 지워도 실패로 안 침 (다음 실행 시작 정리가 오래된 것 지움)
const accounts = require('./accounts');
const { close } = require('./db');

module.exports = async () => {
    try {
        if (process.env.E2E_KEEP_ACCOUNTS === '1') return;
        const removed = await accounts.deleteAccountsLike(accounts.RUN_EMAIL_LIKE);
        console.log(`[e2e] 이번 실행 계정 ${removed}개 지움`);
    } catch (error) {
        console.warn(`[e2e] 이번 실행 계정 지우기 실패 (시험 결과와 상관없음): ${String(error?.message ?? error).slice(0, 160)}`);
    } finally {
        await close().catch(() => {});
    }
};
