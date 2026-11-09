'use strict';

// 실행 끝 정리 파일, 이번 실행(E2E_RUN_ID)에서 만든 계정만 지움 (서버는 그 뒤 Playwright가 끔)
// playwright.config.js globalTeardown, 남기고 싶으면 E2E_KEEP_ACCOUNTS=1 — 다 못 지워도 실패로 안 침 (다음 실행 시작 정리가 오래된 것 지움)
// Node 여러 개면 이번 실행 Redis 앞머리 키·docker 앞단(nginx)도 지움 (서버는 바로 뒤에 꺼짐)
const accounts = require('./accounts');
const { close } = require('./db');
const { E2E, redisPrefix } = require('./env');

// Node 여러 개 뒷정리: 실패해도 시험 결과와 상관없음 (키는 전부 수명이 있음)
async function cleanupMultiNode() {
    if (!E2E.multiNode || process.env.E2E_REUSE === '1') return;
    try {
        const removed = await require('./redis').deletePrefix(redisPrefix());
        console.log(`[e2e] 이번 실행 Redis 키 ${removed}개 지움`);
    } catch (error) {
        console.warn(`[e2e] Redis 키 지우기 실패: ${String(error?.message ?? error).slice(0, 120)}`);
    }
    if (E2E.proxy === 'nginx') require('../scripts/lb-nginx').removeRunContainers();
}

module.exports = async () => {
    try {
        if (process.env.E2E_KEEP_ACCOUNTS === '1') return;
        const removed = await accounts.deleteAccountsLike(accounts.RUN_EMAIL_LIKE);
        console.log(`[e2e] 이번 실행 계정 ${removed}개 지움`);
    } catch (error) {
        console.warn(`[e2e] 이번 실행 계정 지우기 실패 (시험 결과와 상관없음): ${String(error?.message ?? error).slice(0, 160)}`);
    } finally {
        await cleanupMultiNode();
        await close().catch(() => {});
    }
};
