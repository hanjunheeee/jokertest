'use strict';

// 끊김 60초 브라우저 시험 (PC, 진짜 시간) — 오프라인 59초에 돌아오면 산 채로 이어지고, 61초면 판에서 빠져 까닭 글 + 방 목록, 끊긴 동안 투표 마감이 오면 내 표는 기권
// 목록 A09-끊김-나가기-탈주.md 번호 A09-E-085~088·111 (PC 줄) — 60초·단계 마감을 손잡이로 안 넘기고 진짜로 기다림 (@realtime), 시각은 서버가 끊김을 알린 때부터 잼
const { test, expect, ui } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { customRoleSettings } = require('../../helpers/game');
const night = require('./b-night/_night');
const K = require('./_a09-simple-kit');

const cards = (page) => page.locator('[data-ingame-player-nickname]');
// 펼친 시간 바의 단계 글 ("[낮-토론과 투표]"·"[밤-광대]"·"[5초 뒤 마감]")
const phaseLabel = (page) => K.timebar(page).getByText(/^\[.+\]$/).first();
const LABEL_OF = { DAY: /^\[낮-|^\[5초 뒤 마감\]$/, NIGHT: /^\[밤-|^\[5초 뒤 마감\]$/, TRIBUNAL: /^\[재판-|^\[5초 뒤 마감\]$/ };

// 봇이 받은 알림 한 줄 기다림 (받은 시각 at 포함)
async function eventRow(bot, event, { since, match = () => true, timeout = 15_000 }) {
    let row = null;
    await expect.poll(() => {
        row = bot.events.find((r) => r.event === event && r.at >= since && match(r.payload)) ?? null;
        return row !== null;
    }, { timeout, message: `${event} 알림 기다림` }).toBe(true);
    return row;
}

// 오프라인으로 만듦 → 서버가 끊김을 알린 때 (서버의 60초가 시작된 때)
async function goOffline(t, user) {
    const since = Date.now();
    await user.context.setOffline(true);
    return K.droppedAt(t, K.U(user), since, { timeoutMs: 60_000 });
}

// 59초(허용 폭 안, 57.5초)에 온라인 → 돌아온 때
// 화면 소켓은 온라인이 돼도 다음 다시 붙기 시도(최대 5초 간격)까지 기다려서, 새로고침으로 바로 붙임
async function comeBackAt59(t, user, droppedAt) {
    await K.sleepUntil(droppedAt + 59_000 - K.SLACK_MS);
    const since = Date.now();
    await user.context.setOffline(false);
    await user.page.reload();
    const backAt = await K.returnedAt(t, K.U(user), since, { timeoutMs: 15_000 });
    expect(backAt - droppedAt, `끊긴 지 ${backAt - droppedAt}ms에 돌아옴 (60초 전이어야 함)`).toBeLessThan(K.GRACE_MS);
    return backAt;
}

// 60초(+1.5초)가 지나도 판에 산 채로 남아 있고 탈락 알림이 없음
async function expectStillIn(t, user, droppedAt) {
    const me = K.U(user);
    await K.sleepUntil(droppedAt + K.GRACE_MS + K.SLACK_MS);
    const row = await t.player(me);
    expect(row.alive, '60초 뒤에도 산 채').toBe(true);
    expect(row.isParticipating, '60초 뒤에도 참여 중').toBe(true);
    const eliminated = t.bots.some((b) => b.events.some((r) => r.event === 'player_eliminated' && r.payload?.victimUuid === me));
    expect(eliminated, '내 탈락 알림').toBe(false);
}

// 돌아온 화면: 판 화면 그대로, 내 카드 산 채, 시간 바 단계 글이 서버 단계와 같음
async function expectBackInGame(t, user, n) {
    const page = user.page;
    await expect(page).toHaveURL(/\/ingame/);
    await expect(cards(page)).toHaveCount(n, { timeout: 30_000 });
    await expect(K.cardOf(page, user.account.nickname)).toHaveAttribute('data-ingame-player-status', 'alive');
    await expect(async () => {
        const s = await t.state();
        await K.expandBar(page, { locked: s.phase === 'TRIBUNAL' });
        await expect(phaseLabel(page)).toHaveText(LABEL_OF[s.phase], { timeout: 1500 });
    }).toPass({ timeout: 20_000 });
    await expectReadable(phaseLabel(page), { uncovered: false });
}

test('A09-E-085 PC 6명 판(토론 30·투표 30), 토론 중 오프라인 59초 → 온라인 → 산 채로 지금 단계 @game @realtime @smoke', async ({ user, table }) => {
    test.setTimeout(240_000);
    await K.pinTimebar(user.page);
    const t = await K.seat(table, user, { n: 6 });
    await K.toDay(t);
    await K.clear(user.page);
    const droppedAt = await goOffline(t, user);
    await comeBackAt59(t, user, droppedAt);
    await expectBackInGame(t, user, 6);
    await expectStillIn(t, user, droppedAt);
});

test('A09-E-086 PC 7명 판, 오프라인 61초 → 60초에 판에서 빠짐 → 온라인 → 까닭 글 + 방 목록 @game @realtime', async ({ user, table }) => {
    test.setTimeout(240_000);
    const page = user.page;
    const me = K.U(user);
    const t = await K.seat(table, user, { n: 7 });
    await K.toDay(t);
    await K.clear(page);
    const droppedAt = await goOffline(t, user);
    // 서버가 60초(±1.5초)에 탈락시킴
    const outAt = await K.eliminatedAt(t, me, droppedAt, { timeoutMs: 70_000 });
    expect(outAt - droppedAt, `끊긴 지 ${outAt - droppedAt}ms에 탈락`).toBeGreaterThanOrEqual(K.GRACE_MS - K.SLACK_MS);
    expect(outAt - droppedAt, `끊긴 지 ${outAt - droppedAt}ms에 탈락`).toBeLessThanOrEqual(K.GRACE_MS + K.SLACK_MS);
    await K.sleepUntil(droppedAt + 61_000);
    // 온라인이 되어 다시 붙으면 까닭 글 → 방 목록
    const text = await ui.captureAlert(page, () => user.context.setOffline(false), { timeoutMs: 30_000 });
    expect(text).toBe(K.FORFEIT_TEXT);
    await expect(page).toHaveURL(/\/multiplay/, { timeout: 20_000 });
    await expect(page.getByRole('region', { name: '공개 방 목록' })).toBeVisible();
    expect((await t.player(me)).isParticipating).toBe(false);
});

test('A09-E-087 PC 8명 판, 투표 중 오프라인 → 재판·밤으로 넘어간 뒤 59초에 돌아옴 → 산 채 @game @realtime', async ({ user, table }) => {
    test.setTimeout(240_000);
    await K.pinTimebar(user.page);
    const t = await K.seat(table, user, { n: 8 });
    const accused = K.botOf(t, await t.state(), 'CITIZEN');
    const watcher = t.bots.find((b) => b !== accused);
    await K.toVote(t);
    await K.clear(user.page);
    const droppedAt = await goOffline(t, user);
    // 봇 표가 한 봇에 몰림 → 투표 30초 마감에 재판 → 재판 15초(아무도 안 냄 = 무죄) → 밤, 전부 손잡이 없이
    await K.botsVote(t, t.bots.filter((b) => b !== accused), K.U(accused));
    await eventRow(watcher, 'tribunal_vote_resolved', { since: droppedAt, timeout: 55_000 });
    await comeBackAt59(t, user, droppedAt);
    await expectBackInGame(t, user, 8);
    expect((await t.state()).phase, '재판을 지나 밤').toBe('NIGHT');
    expect((await t.player(K.U(accused))).alive, '무죄라 피고는 산 채').toBe(true);
    await expectStillIn(t, user, droppedAt);
});

test('A09-E-088 PC 10명 판 의사, 밤 내 차례에 오프라인 → 차례 마감(30초)이 지나도 안 빠지고 59초에 돌아옴 → 산 채 @game @realtime', async ({ user, table }) => {
    test.setTimeout(240_000);
    const me = K.U(user);
    await K.pinTimebar(user.page);
    const t = await K.seat(table, user, { n: 10, role: 'DOCTOR', settings: customRoleSettings({ JOKER: 1, DOCTOR: 1 }) });
    const watcher = t.bots[0];
    await night.toTurn(t, 'DOCTOR', { dayIndex: 1 });
    const droppedAt = await goOffline(t, user);
    // 내 차례 마감(밤 30초)은 손잡이 없이 지나감 → 그때 안 빠짐
    const ended = await eventRow(watcher, 'night_turn_ended', { since: droppedAt, match: (p) => p.role === 'DOCTOR' && p.dayIndex === 1, timeout: 40_000 });
    expect(ended.at - droppedAt, '차례 마감은 끊긴 지 60초 전').toBeLessThan(K.GRACE_MS);
    const afterTurn = await t.player(me);
    expect(afterTurn.alive, '차례 마감 뒤에도 산 채').toBe(true);
    expect(afterTurn.isParticipating, '차례 마감 뒤에도 참여 중').toBe(true);
    await comeBackAt59(t, user, droppedAt);
    await expectBackInGame(t, user, 10);
    await expectStillIn(t, user, droppedAt);
});

test('A09-E-111 PC 6명 판(투표 30), 오프라인 35초 동안 투표 마감 → 온라인 → 투표 현황에 내 표는 기권 @game @realtime', async ({ user, table }) => {
    test.setTimeout(240_000);
    const page = user.page;
    const me = K.U(user);
    const t = await K.seat(table, user, { n: 6 });
    const target = K.botOf(t, await t.state(), 'CITIZEN');
    await K.toVote(t);
    await K.clear(page);
    const droppedAt = await goOffline(t, user);
    // 봇 5: 둘은 target을 찍고 셋은 기권을 냄, 나는 끊겨서 못 냄
    const pickers = t.bots.filter((b) => b !== target).slice(0, 2);
    await K.botsVote(t, pickers, K.U(target));
    await K.botsVote(t, t.bots.filter((b) => !pickers.includes(b)), null);
    // 투표 마감(30초)은 손잡이 없이 지나감
    const resolved = await eventRow(target, 'day_vote_resolved', { since: droppedAt, timeout: 40_000 });
    expect(resolved.at - droppedAt, '끊긴 동안 판정').toBeLessThan(35_000);

    await K.sleepUntil(droppedAt + 35_000);
    const since = Date.now();
    await user.context.setOffline(false);
    const backAt = await K.returnedAt(t, me, since, { timeoutMs: 15_000 });
    expect(backAt - droppedAt, '60초 전에 돌아옴').toBeLessThan(K.GRACE_MS);

    // 찍힌 표 2 · 기권 4 (기권 낸 봇 3 + 못 낸 나 1) → 내 표가 기권에 들어 있음
    const dialog = page.getByRole('dialog', { name: '투표 현황' });
    await expect(async () => {
        if (!(await dialog.isVisible())) {
            await ui.closeOverlays(page);
            await page.getByRole('button', { name: '투표 현황 열기' }).click({ timeout: 2000 });
        }
        await expect(dialog).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 20_000 });
    const abstain = dialog.getByTestId('vote-status-public-abstain-count');
    await expect(abstain).toHaveText('4');
    await expectReadable(abstain);
    expect((await t.player(me)).alive).toBe(true);
});
