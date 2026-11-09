'use strict';

// 시험 도구 모음 파일, 모든 시험이 이 test·expect를 씀 (require('../../helpers/fixtures'))
// 시험마다 새 계정·새 브라우저 context, 봇·판은 시험 끝에 닫음 — 시험끼리 상태 공유 금지 (README)
const base = require('@playwright/test');
const { devices } = base;
const { E2E } = require('./env');
const accountsLib = require('./accounts');
const { spawnBots } = require('./bots');
const { setupTable } = require('./game');
const ui = require('./ui');
const mail = require('./mail');
const { internal, e2e } = require('./internal');

// 사람 하나 = 계정 + 자기 쿠키만 가진 브라우저 context + page
const DESKTOP = { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 }, baseURL: E2E.desktopUrl, locale: 'ko-KR', timezoneId: 'Asia/Seoul' };
const MOBILE = { ...devices['Pixel 7'], viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, baseURL: E2E.mobileUrl, locale: 'ko-KR', timezoneId: 'Asia/Seoul' };

/**
 * 사람 하나 열기: 새 브라우저 context(자기 쿠키만) → 계정(없으면 새로) → 로그인(API) → 로비
 * players 도우미와 b-night의 사람 바꿔 끼우기가 씀, onContext는 만들자마자 부름 (실패해도 닫히게 먼저 적어 둠)
 * @returns {Promise<{ account:object, context:import('@playwright/test').BrowserContext, page:import('@playwright/test').Page }>}
 */
async function openPerson(browser, { mobile = false, account, lobby = true, login = true, onContext = () => {} } = {}) {
    const context = await browser.newContext(mobile ? MOBILE : DESKTOP);
    onContext(context);
    const acc = account ?? await accountsLib.createAccount();
    const page = await context.newPage();
    if (login) await ui.loginViaApi(context, acc);
    if (login && lobby) await ui.gotoLobby(page);
    return { account: acc, context, page };
}

const test = base.test.extend({
    /**
     * 계정 만들기: await accounts.create({ nickname?, password?, birthDate?, emailVerified?, agreeTerms?, role? })
     * 계정은 실행 끝(global-teardown)에 이번 실행 것만 지움
     */
    accounts: async ({}, use) => {
        await use({
            create: (o) => accountsLib.createAccount(o),
            createMany: (n, o) => accountsLib.createAccounts(n, o),
        });
    },

    /** 기본 page를 새 계정으로 로그인(API)한 뒤 로비까지: { account, page } */
    user: async ({ page, context }, use) => {
        const account = await accountsLib.createAccount();
        await ui.loginViaApi(context, account);
        await ui.gotoLobby(page);
        await use({ account, page, context });
    },

    /**
     * 사람 더 만들기 (각자 따로 쿠키): const p = await players.add({ mobile?, account?, lobby=true })
     * → { account, context, page } (로그인됨, 로비에 있음)
     */
    players: async ({ browser }, use, testInfo) => {
        const opened = [];
        const isMobileProject = testInfo.project.name === 'mobile';
        await use({
            add: ({ mobile = isMobileProject, account, lobby = true, login = true } = {}) => openPerson(browser, {
                mobile, account, lobby, login, onContext: (context) => opened.push(context),
            }),
        });
        await Promise.all(opened.map((c) => c.close().catch(() => {})));
    },

    /** 봇 만들기: const bots = await botsFactory.spawn(3) → E2eBot[] (로그인·소켓 접속됨, 시험 끝에 닫힘) */
    bots: async ({}, use) => {
        const spawned = [];
        await use({
            spawn: async (n, o = {}) => {
                const accs = await accountsLib.createAccounts(n, o.account ?? {});
                const list = await spawnBots(accs, { startIndex: spawned.length + 1 });
                spawned.push(...list);
                return list;
            },
        });
        await Promise.all(spawned.map((b) => b.close().catch(() => {})));
    },

    /** 판 차리기: const t = await table.setup({ humans, bots, settings, roles }) — helpers/game.js 설명 참고 */
    table: async ({}, use) => {
        const tables = [];
        await use({
            setup: async (o) => {
                const t = await setupTable(o);
                tables.push(t);
                return t;
            },
        });
        await Promise.all(tables.map((t) => t.close()));
    },

    mail: async ({}, use) => { await use(mail); },
    internal: async ({}, use) => { await use(internal); },
    e2e: async ({}, use) => { await use(e2e); },
    ui: async ({}, use) => { await use(ui); },
});

module.exports = { test, expect: base.expect, E2E, DESKTOP, MOBILE, openPerson, ui, mail, internal, e2e };
