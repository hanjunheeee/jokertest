'use strict';

// 다·라 묶음 도우미 (관리자 창 열기·로그인), 이름이 _로 시작해 장면으로 안 읽음
// da.js·ra.js가 불러 씀 — 관리자 계정·로그인은 e2e helpers/adminAccounts 그대로, 창 값은 e2e tests/admin/_a14-kit PC_VIEW
const { fromE2e } = require('../lib/paths');

const { E2E } = fromE2e('helpers/env');
const admins = fromE2e('helpers/adminAccounts');
const k = fromE2e('tests/admin/_a14-kit');

/**
 * 관리자 창 하나 열고 화면으로 로그인 → { context, page, kind, label, admin }
 * 창은 s.adopt로 장면에 넣음 (장면이 닫히면 같이 닫힘, 관리자 계정은 도구 끝에 e2e 정리가 지움)
 * @param {import('../lib/session').Session} s
 * @param {{ kind?: 'big'|'small', label?: string }} [o] 사람 창 옆에 둘 땐 'small'
 */
async function openAdmin(s, { kind = 'big', label = '관리자' } = {}) {
    const browser = await s.windows.browser(kind);
    const options = { ...k.PC_VIEW, baseURL: E2E.adminUrl, locale: 'ko-KR', timezoneId: 'Asia/Seoul' };
    // 윈도우 작은 창은 배율을 같이 줄여야 1280×800이 다 보임 (맥·창 없는 모드는 1)
    const scale = s.windows.scaleOf(kind);
    if (scale !== 1) options.deviceScaleFactor = scale;
    const context = await browser.newContext(options);
    const page = await context.newPage();
    const entry = await s.adopt({ context, page, kind, label });
    const admin = await admins.createAdmin();
    await admins.loginAsAdmin(page, admin);
    return { ...entry, admin };
}

module.exports = { openAdmin, k };
