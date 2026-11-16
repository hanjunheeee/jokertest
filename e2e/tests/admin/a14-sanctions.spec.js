'use strict';

// 관리자 제재 브라우저 시험 (PC 크기) — 기간·영구 정지(정지당한 플레이어 창 안내·다시 로그인 막힘), 해제, 강제 접속 종료, 이미 정지 중, 기간 바꾸기, 확인 창, 판 중 정지·강제 종료
// 목록 시험목록/A14-관리자.md 번호 A14-E-022~031·033 — 돌리지 않고 모임만: npx playwright test --list tests/admin/a14-sanctions.spec.js
const { test, expect, DESKTOP } = require('../../helpers/fixtures');
const { expectReadable, parseColor } = require('../../helpers/visible');
const ui = require('../../helpers/ui');
const A = require('../ingame/_a04-multi');
const N = require('../ingame/b-night/_night');
const k = require('./_a14-kit');

const { E, U, TEXT } = k;
const DAY_MS = 24 * 60 * 60 * 1000;
const banRows = (page) => k.listRows(page, '정지 기록');
const activeNote = (page) => page.getByRole('region', { name: '제재' }).locator('p').filter({ hasText: /^정지 중 — / });

// 지금부터 days일 뒤 끝 시각 글자 후보 (누르는 사이 분이 바뀔 수 있어 앞뒤 1분)
const endTexts = (days) => [-60_000, 0, 60_000].map((d) => k.kstText(Date.now() + days * DAY_MS + d));

test(`${E(22)} 로비에 있는 플레이어 1일 정지 → 플레이어 창 정지 안내 → 다시 로그인하면 정지 글 @smoke`, async ({ browser, players }) => {
    const player = await k.openPlayer(players);
    const w = await k.openAdmin(browser);
    try {
        const reason = `욕설 반복 ${k.rand()}`;
        const box = await k.banUi(w.page, player, { days: 1, reason });
        const pushed = await ui.captureAlert(player.page, () => k.confirmBan(w.page, box));
        expect(pushed).toContain(TEXT.bannedPush);
        await expect(player.page).toHaveURL(/\/login/);
        // 결정(둘째 9번): 로그인 거절 글 뒤에 사유가 붙음
        expect(await k.loginAlert(player.page, player.account)).toBe(TEXT.bannedLogin(reason));
        await expect(player.page).toHaveURL(/\/login/);
    } finally {
        await w.close();
    }
});

test(`${E(23)} 정지 → 해제(사유) → 플레이어 로그인 됨, 상세 정지 기록에 해제 사유`, async ({ browser, accounts }) => {
    const member = await accounts.create();
    const w = await k.openAdmin(browser);
    try {
        await k.adminApi(w.page, 'POST', `/members/${U(member)}/bans`, { kind: 'PERIOD', days: 7, reason: '시험 정지' });
        const liftReason = `오해로 정지 ${k.rand()}`;
        const box = await k.reasonDialog(w.page, member, '제재 해제', '제재 해제', liftReason);
        await box.getByRole('button', { name: '해제하기' }).click();
        await expect(box).toBeHidden();
        await expect(w.page.getByRole('region', { name: '제재' }).getByRole('status')).toHaveText('정지 1건을 풀었어요.');
        const line = banRows(w.page).filter({ hasText: liftReason });
        await expect(line).toHaveCount(1);
        await expectReadable(line.getByText(liftReason, { exact: true }));
        await expect(line).toContainText(w.admin.loginId);

        const ctx = await browser.newContext(DESKTOP);
        try {
            const page = await ctx.newPage();
            await k.loginUi(page, member);
            await expect(page).toHaveURL(/\/lobby/);
        } finally {
            await ctx.close();
        }
    } finally {
        await w.close();
    }
});

test(`${E(24)} 강제 접속 종료 → 플레이어 창 끊김 안내, 다시 로그인 됨`, async ({ browser, players }) => {
    const player = await k.openPlayer(players);
    const w = await k.openAdmin(browser);
    try {
        const box = await k.reasonDialog(w.page, player, '강제 접속 종료', '강제 접속 종료', '시험 끊기');
        const pushed = await ui.captureAlert(player.page, () => box.getByRole('button', { name: '접속 끊기' }).click());
        expect(pushed).toBe(TEXT.kickedPush);
        await expect(w.page.getByRole('region', { name: '제재' }).getByRole('status')).toContainText('바로 끊었어요.');
        await expect(player.page).toHaveURL(/\/login/);
        await k.loginUi(player.page, player.account);
        await expect(player.page).toHaveURL(/\/lobby/);
    } finally {
        await w.close();
    }
});

test(`${E(25)} 영구 정지 → 플레이어 로그인 막힘, 상세 "영구"`, async ({ browser, players }) => {
    const player = await k.openPlayer(players);
    const w = await k.openAdmin(browser);
    try {
        const reason = `영구 정지 사유 ${k.rand()}`;
        const box = await k.banUi(w.page, player, { kind: 'PERMANENT', reason });
        const pushed = await ui.captureAlert(player.page, () => k.confirmBan(w.page, box));
        expect(pushed).toContain(TEXT.bannedPush);
        expect(await k.loginAlert(player.page, player.account)).toBe(TEXT.bannedLogin(reason));
        await expectReadable(activeNote(w.page));
        await expect(activeNote(w.page)).toContainText('영구');
        await expect(banRows(w.page).filter({ hasText: reason })).toContainText('영구');
    } finally {
        await w.close();
    }
});

test(`${E(26)} 이미 정지 중인 사람 또 정지 → "이미 정지 중"·기간 바꾸기 안내`, async ({ browser, accounts }) => {
    const member = await accounts.create();
    const w = await k.openAdmin(browser);
    try {
        // 화면은 정지 전 상세를 연 채로, 그사이 다른 곳(관리자 API)에서 먼저 정지됨
        const box = await k.banUi(w.page, member, { days: 7, reason: '두 번째 정지' });
        await k.adminApi(w.page, 'POST', `/members/${U(member)}/bans`, { kind: 'PERIOD', days: 7, reason: '먼저 정지' });
        await box.getByRole('button', { name: '정지하기' }).click();
        const refused = box.getByRole('alert');
        await expect(refused).toContainText('이미 정지 중이에요.');
        await expect(refused).toContainText('기간 바꾸기');
        await expectReadable(refused);
    } finally {
        await w.close();
    }
});

test(`${E(27)} 7일 정지를 1일로 기간 바꾸기 → 상세 끝 시각 바뀜, 처리 이력 "정지 기간 바꿈"`, async ({ browser, accounts }) => {
    const member = await accounts.create();
    const w = await k.openAdmin(browser);
    try {
        await k.adminApi(w.page, 'POST', `/members/${U(member)}/bans`, { kind: 'PERIOD', days: 7, reason: '시험 정지' });
        await k.openMember(w.page, member);
        await expect(activeNote(w.page)).toContainText(new RegExp(endTexts(7).join('|')));
        await w.page.getByRole('region', { name: '제재' }).getByRole('button', { name: '기간 바꾸기', exact: true }).click();
        const box = k.dialog(w.page, '정지 기간 바꾸기');
        await box.getByLabel('정지 일수').fill('1');
        await box.getByLabel(/^바꾸는 사유/).fill('하루로 줄임');
        await box.getByRole('button', { name: '기간 바꾸기' }).click();
        await expect(box).toBeHidden();
        await expect(activeNote(w.page)).toContainText(new RegExp(endTexts(1).join('|')));
        await expectReadable(activeNote(w.page));

        const audit = await k.auditRows(w.page, w.admin, { kind: '제재·해제 이력' });
        await expect(audit.filter({ hasText: '정지 기간 바꿈' })).toHaveCount(1);
    } finally {
        await w.close();
    }
});

test(`${E(28)} 정지 확인 창 사유 빔 → "정지하기" 꺼짐, 글 쓰면 켜짐`, async ({ browser, accounts }) => {
    const member = await accounts.create();
    const w = await k.openAdmin(browser);
    try {
        const box = await k.banUi(w.page, member, { days: 7, reason: '' });
        await expect(box.getByRole('button', { name: '정지하기' })).toBeDisabled();
        await box.getByLabel(/^정지 사유/).fill('   ');
        await expect(box.getByRole('button', { name: '정지하기' })).toBeDisabled();
        await box.getByLabel(/^정지 사유/).fill('욕설');
        await expect(box.getByRole('button', { name: '정지하기' })).toBeEnabled();
    } finally {
        await w.close();
    }
});

test(`${E(29)} 정지 확인 창에 대상 닉네임·"7일"·사유가 읽힘`, async ({ browser, accounts }) => {
    const member = await accounts.create();
    const w = await k.openAdmin(browser);
    try {
        const box = await k.banUi(w.page, member, { days: 7, reason: '도배 반복' });
        await expectReadable(box.getByText(`대상: ${member.nickname}`, { exact: true }));
        await expectReadable(box.getByText(/^기간: 7일 \(/));
        await expectReadable(box.getByText('사유: 도배 반복', { exact: true }));
    } finally {
        await w.close();
    }
});

test(`${E(30)} 사람 1 + 봇 4 = 5명 판 낮 → 관리자가 사람 정지 → 사람 창 정지 안내, 봇 판은 계속 @game`, async ({ browser, players, table }) => {
    const player = await k.openPlayer(players);
    const t = await A.openTable(table, { humans: [player], bots: 4, roles: A.plainRoles() });
    await N.toDay(t);
    await A.calm(player.page);
    const w = await k.openAdmin(browser);
    try {
        const box = await k.banUi(w.page, player, { days: 1, reason: '판 중 정지' });
        const pushed = await ui.captureAlert(player.page, () => k.confirmBan(w.page, box));
        expect(pushed).toContain(TEXT.bannedPush);
        await expect(player.page).toHaveURL(/\/login/);
        // 봇 쪽 판은 이어짐: 단계를 넘기면 봇이 다음 단계 알림을 받음
        const since = Date.now();
        await t.advance();
        await t.bots[1].waitForEvent('day_phase_changed', { since });
        expect((await t.state())?.phase).not.toBe('ENDED');
    } finally {
        await w.close();
    }
});

test(`${E(31)} 사람 1 + 봇 5 = 6명 판 → 강제 접속 종료 → 끊김 안내 → 다시 로그인 → 판 화면으로 (산 채로 판에 남음, 결정 둘째 7번) @game`, async ({ browser, players, table }) => {
    const player = await k.openPlayer(players);
    const t = await A.openTable(table, { humans: [player], bots: 5, roles: A.plainRoles() });
    await N.toDay(t);
    await A.calm(player.page);
    const w = await k.openAdmin(browser);
    try {
        const box = await k.reasonDialog(w.page, player, '강제 접속 종료', '강제 접속 종료', '판 중 끊기');
        const pushed = await ui.captureAlert(player.page, () => box.getByRole('button', { name: '접속 끊기' }).click());
        expect(pushed).toBe(TEXT.kickedPush);
        // 결정(둘째 7번): 정지 없이 끊기만 한 사람은 다시 붙으면 판에 남음 (60초 안에 돌아옴)
        await k.loginUi(player.page, player.account);
        await expect(player.page).toHaveURL(/\/ingame/, { timeout: 20_000 });
        await expect.poll(async () => (await t.player(U(player)))?.isParticipating, { message: '판에 남음' }).not.toBe(false);
        expect((await t.player(U(player)))?.alive).toBe(true);
    } finally {
        await w.close();
    }
});

test(`${E(33)} 정지 단추 바탕이 빨강 계열, 글 대비 4.5 이상`, async ({ browser, accounts }) => {
    const member = await accounts.create();
    const w = await k.openAdmin(browser);
    try {
        await k.openMember(w.page, member);
        const button = w.page.getByRole('region', { name: '제재' }).getByRole('button', { name: '기간 정지', exact: true });
        const r = await expectReadable(button);
        expect(r.ratio).toBeGreaterThanOrEqual(4.5);
        const bg = parseColor(await button.evaluate((el) => getComputedStyle(el).backgroundColor));
        expect(bg, '바탕색을 읽음').not.toBeNull();
        // 빨강 계열: 빨강이 가장 크고 초록·파랑보다 확실히 큼
        expect(bg.r - Math.max(bg.g, bg.b), `바탕 rgb(${bg.r}, ${bg.g}, ${bg.b})`).toBeGreaterThanOrEqual(60);
    } finally {
        await w.close();
    }
});

