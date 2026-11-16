'use strict';

// 서버 2대 끊기 신호 브라우저 시험 (어려움) — 한 서버가 받은 정지·강제 끊기·새 탭·새 로그인이 다른 서버에 붙은 옛 화면을 끊고 까닭 글을 띄움
// 목록 A17-서버-여러대.md 번호 A17-H-025~028 (PC는 까닭 글이 브라우저 알림 창이라 글만 봄, E2E_NODES=2에서만 돎), 모임만: E2E_NODES=2 npx playwright test --list --no-deps tests/multinode/a17-signals-hard.spec.js
const K = require('./_a17-kit');
const { ui } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const N = require('../ingame/b-night/_night');

const { test, expect, mn, N1, N2, U } = K;

// 정지 없는 강제 끊기는 안내 글만 띄우고 /login으로 안 가며, 로비에 남아 다시 붙음(세션이 살아 있음)
async function expectStaysInLobby(page) {
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page).toHaveURL(/\/lobby$/, { timeout: 15_000 });
    await expectReadable(page.getByRole('button', { name: '친구 목록' }), { contrast: false });
}

// 로그인 화면으로 나왔는지: 주소 + "로그인" 단추가 눌리는 자리에 읽힘
async function expectLoginScreen(page) {
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
    await expectReadable(page.getByRole('button', { name: '로그인', exact: true }), { contrast: false });
}

test('A17-H-025 서버 ㄴ 6명 판 중인 사람을 관리자가 정지(요청은 서버 ㄱ이 받음) → 그 사람 화면 정지 안내 + 로그인 화면 @game @hard @smoke', async ({ browser, crowd, bots }) => {
    test.setTimeout(300_000);
    const me = await crowd.on(N2);
    const [hostBot, ...otherBots] = await mn.botsOn(bots, 5, N2);
    const { t } = await K.startGame({ hostBot, otherBots, people: [me] });
    expect(await mn.gameNodeOf(U(me)), '판이 도는 서버').toBe(N2);
    await N.toDay(t, { dayIndex: 1 });

    const admin = await K.openAdmin(browser);
    try {
        const text = await ui.captureAlert(
            me.page,
            () => K.adminApi(admin.page, 'POST', `/members/${U(me)}/bans`, { kind: 'PERIOD', days: 1, reason: '시험 정지' }, { node: N1 }),
            { timeoutMs: 20_000 },
        );
        expect(text).toContain('정지된 계정입니다');
        await expectLoginScreen(me.page);
    } finally {
        await admin.close();
    }
});

test('A17-H-026 서버 ㄴ 로비 사람을 관리자가 강제 끊기(요청은 서버 ㄱ이 받음) → 그 사람 화면 끊김 안내 + 로그인 화면으로 안 가고 로비에 남음 @hard', async ({ browser, crowd }) => {
    const me = await crowd.on(N2);
    const admin = await K.openAdmin(browser);
    try {
        const text = await ui.captureAlert(
            me.page,
            () => K.adminApi(admin.page, 'POST', `/members/${U(me)}/force-disconnect`, { reason: '시험 강제 끊기' }, { node: N1 }),
            { timeoutMs: 20_000 },
        );
        expect(text).toBe(K.TEXT.adminCut);
        await expectStaysInLobby(me.page);
    } finally {
        await admin.close();
    }
});

test('A17-H-027 탭1은 서버 ㄱ 로비 → 같은 브라우저 탭2를 서버 ㄴ 힌트로 엶 → 탭1에 "같은 브라우저의 다른 창…" 안내, 탭2는 로비 그대로 @hard', async ({ crowd }) => {
    const me = await crowd.on(N1);
    await me.pin(N2);
    let tab = null;
    const text = await ui.captureAlert(me.page, async () => {
        tab = await me.context.newPage();
        await ui.gotoLobby(tab);
    }, { timeoutMs: 20_000 });
    expect(text).toBe(K.TEXT.sameBrowser);

    // 같은 로그인이라 옛 탭은 안내만 (로그아웃 안 됨), 새 탭은 서버 ㄴ 로비에서 그대로
    await expect(me.page).not.toHaveURL(/\/login/);
    await expect(tab).toHaveURL(/\/lobby$/);
    expect(await K.hintOf(tab), '새 탭 서버 힌트').toBe(N2);
    await expectReadable(tab.getByRole('button', { name: '친구 목록' }), { contrast: false });
});

test('A17-H-028 기기1은 서버 ㄱ 로비 → 기기2가 같은 계정으로 새 로그인해 서버 ㄴ으로 → 기기1에 "다른 기기 또는 브라우저에서 로그인…" 안내 + 로그인 화면 @hard', async ({ crowd }) => {
    const first = await crowd.on(N1);
    let second = null;
    const text = await ui.captureAlert(first.page, async () => {
        second = await crowd.on(N2, { account: first.account });
    }, { timeoutMs: 20_000 });
    expect(text).toBe(K.TEXT.otherLogin);
    await expectLoginScreen(first.page);

    // 새 기기는 서버 ㄴ 로비에서 그대로
    await expect(second.page).toHaveURL(/\/lobby$/);
    expect(await K.hintOf(second.page), '새 기기 서버 힌트').toBe(N2);
    await expectReadable(second.page.getByRole('button', { name: '친구 목록' }), { contrast: false });
});
