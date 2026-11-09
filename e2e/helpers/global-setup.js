'use strict';

// 실행 시작 정리 파일, 오래된(기본 6시간 넘은) e2e 계정·메일 파일·test-results 실행 폴더만 지움 — 지금 도는 남의 실행 것은 안 건드림
// 서버는 webServer가 이미 켬, DB 연결은 안 닫음 (같은 프로세스의 global-teardown이 다시 씀, 닫으면 모델을 다시 못 엶)
// playwright.config.js globalSetup, 시간은 E2E_STALE_HOURS로 바꿈
const fs = require('node:fs');
const path = require('node:path');
const { MAIL_DIR, E2E_DIR } = require('./env');
const accounts = require('./accounts');

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

module.exports = async () => {
    const hours = Number(process.env.E2E_STALE_HOURS || 6);
    if (!(hours > 0)) throw new Error('E2E_STALE_HOURS는 0보다 큰 수');
    let removed = 0;
    try {
        removed = await accounts.deleteStaleAccounts(hours);
    } catch (error) {
        // 정리 실패로 시험을 막지 않음 (다음 실행이 다시 지움)
        console.warn(`[e2e] 오래된 계정 지우기 실패 (다음 실행 때 다시): ${String(error?.message ?? error).slice(0, 120)}`);
    }
    const mails = removeStaleMails(hours);
    const results = removeStaleResults(hours);
    if (removed > 0 || mails > 0 || results > 0) console.log(`[e2e] ${hours}시간 넘은 계정 ${removed}개·메일 파일 ${mails}개·결과 폴더 ${results}개 지움`);
};
