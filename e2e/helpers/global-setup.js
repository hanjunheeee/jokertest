'use strict';

// 실행 시작 정리 파일, 오래된(기본 6시간 넘은) e2e 계정·메일 파일·test-results 실행 폴더만 지움 — 지금 도는 남의 실행 것은 안 건드림
// 서버는 webServer가 이미 켬, DB 연결은 안 닫음 (같은 프로세스의 global-teardown이 다시 씀, 닫으면 모델을 다시 못 엶)
// playwright.config.js globalSetup, 시간은 E2E_STALE_HOURS로 바꿈
// 바깥 막기 확인도 여기서 한 번: 크로미움 주소 규칙이 안 먹으면 창마다 가로채기로 바꿈 (helpers/outside.js)
// Node 여러 개(E2E_NODES=2)면 시험 Redis PING도 (이번 실행 앞머리는 서버가 켜기 전 start-backend.js가 비움, 여기서 지우면 켜진 Node 기록이 사라짐)
const fs = require('node:fs');
const path = require('node:path');
const { MAIL_DIR, E2E_DIR, E2E } = require('./env');
const accounts = require('./accounts');
const outside = require('./outside');

// 메일 파일 중 마지막으로 쓴 지 hours시간 넘은 것만 지움 (이번·남의 실행 메일은 방금 쓴 것이라 남음)
function removeStaleMails(hours) {
    fs.mkdirSync(MAIL_DIR, { recursive: true });
    const cutoff = Date.now() - hours * 3600_000;
    let removed = 0;
    for (const name of fs.readdirSync(MAIL_DIR)) {
        const file = path.join(MAIL_DIR, name);
        try {
            const stat = fs.statSync(file);
            if (stat.isFile() && stat.mtimeMs < cutoff) { fs.rmSync(file, { force: true }); removed += 1; }
        } catch { /* 다른 실행이 먼저 지움 */ }
    }
    return removed;
}

// test-results 아래 지난 실행 폴더(실행 번호별) 중 hours시간 넘은 것만 지움 (지금 실행 폴더·남의 실행 폴더는 남음)
function removeStaleResults(hours) {
    const dir = path.join(E2E_DIR, 'test-results');
    if (!fs.existsSync(dir)) return 0;
    const cutoff = Date.now() - hours * 3600_000;
    const mine = process.env.E2E_RUN_ID;
    let removed = 0;
    for (const name of fs.readdirSync(dir)) {
        if (name === mine) continue;
        const target = path.join(dir, name);
        try {
            if (fs.statSync(target).mtimeMs < cutoff) { fs.rmSync(target, { recursive: true, force: true }); removed += 1; }
        } catch { /* 다른 실행이 먼저 지움 */ }
    }
    return removed;
}

/**
 * 크로미움 주소 규칙(--host-resolver-rules)이 진짜 먹는지 한 번 봄 (브라우저 하나 잠깐 켬, 바깥으로 나가는 요청 없음)
 * 확인용 이름은 원래 이 PC로 풀리는 이름(.localhost) → 규칙이 먹으면 "없는 주소" 오류, 안 먹으면 시험 백엔드 /health가 열림
 * @returns {Promise<boolean>} 먹으면 true
 */
async function hostRulesWork() {
    const { chromium } = require('@playwright/test');
    const browser = await chromium.launch({ args: outside.chromiumArgs(), timeout: 30_000 });
    try {
        const page = await browser.newPage();
        const error = await page.goto(`http://${outside.PROBE_HOST}:${E2E.backendPort}/health`, { timeout: 10_000 }).then(() => null, (e) => e);
        return /ERR_NAME_NOT_RESOLVED/.test(String(error?.message ?? ''));
    } finally {
        await browser.close().catch(() => {});
    }
}

// 주소 규칙이 안 먹거나 확인을 못 하면 모든 창에 가로채기를 걸게 함 (작업자는 이 환경값을 물려받음) — 확인 실패로 시험을 막지 않음
async function checkOutsideBlock() {
    if (String(process.env.E2E_OUTSIDE_ROUTE ?? '').toLowerCase() === 'all') return;
    const ok = await hostRulesWork().catch(() => false);
    if (ok) return;
    process.env.E2E_OUTSIDE_ROUTE = 'all';
    console.warn('[e2e] 바깥 막기: 크로미움 주소 규칙을 확인 못 함 → 모든 창에 가로채기를 걺 (광고·분석·토스 주소, 그 창들은 브라우저 캐시 꺼짐)');
}

module.exports = async () => {
    await checkOutsideBlock();
    if (E2E.multiNode && !(await require('./redis').ping())) {
        throw new Error(`E2E_NODES=${E2E.nodeCount}인데 시험 Redis(${E2E.redisUrl})가 PING에 답 없음`);
    }
    const hours = Number(process.env.E2E_STALE_HOURS || 6);
    if (!(hours > 0)) throw new Error('E2E_STALE_HOURS는 0보다 큰 수');
    let removed = 0;
    try {
        removed = await accounts.deleteStaleAccounts(hours);
        // 탈퇴한 시험 계정은 이메일이 바뀌어 위에 안 걸림 → 탈퇴 이메일 모양으로 따로
        removed += await accounts.deleteStaleWithdrawn(hours);
        removed += await require('./adminAccounts').deleteStaleAdmins(hours);
        accounts.removeStaleCreatedFiles(hours);
    } catch (error) {
        // 정리 실패로 시험을 막지 않음 (다음 실행이 다시 지움)
        console.warn(`[e2e] 오래된 계정 지우기 실패 (다음 실행 때 다시): ${String(error?.message ?? error).slice(0, 120)}`);
    }
    const mails = removeStaleMails(hours);
    const results = removeStaleResults(hours);
    if (removed > 0 || mails > 0 || results > 0) console.log(`[e2e] ${hours}시간 넘은 계정 ${removed}개·메일 파일 ${mails}개·결과 폴더 ${results}개 지움`);
};
