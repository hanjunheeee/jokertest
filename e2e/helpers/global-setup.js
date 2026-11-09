'use strict';

// 실행 시작 정리 파일, 지난 실행에서 남은 e2e 계정·메일 파일 지우기 (서버는 webServer가 이미 켬, DB도 그때 준비됨)
// DB 연결은 안 닫음 (같은 프로세스의 global-teardown이 다시 씀, 닫으면 모델을 다시 못 엶)
// playwright.config.js globalSetup
const fs = require('node:fs');
const { MAIL_DIR } = require('./env');
const accounts = require('./accounts');

module.exports = async () => {
    // 켜 둔 서버를 여럿이 같이 쓰면(E2E_REUSE=1) 남의 실행 계정·메일까지 지워짐 → 안 지움 (끝 정리는 실행 번호별이라 그대로)
    if (process.env.E2E_REUSE === '1') return;
    const removed = await accounts.deleteAccountsLike(accounts.ALL_E2E_EMAIL_LIKE);
    fs.rmSync(MAIL_DIR, { recursive: true, force: true });
    fs.mkdirSync(MAIL_DIR, { recursive: true });
    if (removed > 0) console.log(`[e2e] 지난 실행 계정 ${removed}개 지움`);

};
