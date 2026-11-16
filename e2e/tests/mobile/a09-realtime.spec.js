'use strict';

// 모바일 끊김 60초 브라우저 시험 (진짜 시간) — 오프라인 59초에 돌아오면 산 채로 이어지고, 61초면 판에서 빠져 까닭 글 + 방 목록, 끊긴 동안 투표 마감이 오면 내 표는 기권
// 목록 A09-끊김-나가기-탈주.md 번호 A09-E-089·090·112 (모바일 줄) — 60초·투표 마감을 손잡이로 안 넘기고 진짜로 기다림 (@realtime), 시각은 서버가 끊김을 알린 때부터 잼
// 오프라인은 화면 소켓 길목을 끊어 만듦: 브라우저 오프라인 흉내(setOffline)는 열린 소켓을 바로 안 끊어 서버가 20~45초 뒤에야 앎 → 30초 투표 마감과 엇갈림
const { test, expect, ui } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { talk, clearOverlays } = require('./_talk');
const K = require('../ingame/_a09-simple-kit');
const H = require('../ingame/_a09-hard-kit');

// 오프라인으로 만듦: 화면 소켓을 끊고 새 접속도 거절 → 서버가 끊김을 알린 때 (서버의 60초가 시작된 때)
// gate는 판에 들어가기 전에 건 소켓 길목 (H.socketGate)
const goOffline = (t, user, gate) => H.goOffline(t, user, gate);

// 새로고침 → 로그인 확인 → 소켓 접속까지 드는 시간 (이만큼 앞당겨 길을 엶)
const RETURN_LEAD_MS = 3000;

// 판 앉히고 첫 낮까지
async function seatAtDay(table, user, n) {
    const t = await K.seat(table, user, { n });
    await K.toDay(t);
    await expect(talk.phaseLine(user.page)).toContainText('낮 토론', { timeout: 15_000 });
    await clearOverlays(user.page);
    return t;
}

test('A09-E-089 모바일 6명 판, 오프라인 59초 → 온라인 → 산 채로 이어짐 @game @realtime @smoke', async ({ user, table }) => {
    test.setTimeout(240_000);
    const page = user.page;
    const me = K.U(user);
    const gate = await H.socketGate(user);
    const t = await seatAtDay(table, user, 6);
    const droppedAt = await goOffline(t, user, gate);
    // 59초 무렵에 온라인 — 화면 소켓은 다음 다시 붙기 시도(최대 7.5초 간격)까지 기다려서, 56초에 길을 열고 새로고침으로 바로 붙임
    // (60초 규칙·허용 폭은 그대로: 붙은 때가 60초 전인지 그대로 봄)
    await K.sleepUntil(droppedAt + 59_000 - RETURN_LEAD_MS);
    const since = Date.now();
    gate.open();
    await page.reload();
    const backAt = await K.returnedAt(t, me, since, { timeoutMs: 15_000 });
    expect(backAt - droppedAt, `끊긴 지 ${backAt - droppedAt}ms에 돌아옴 (60초 전이어야 함)`).toBeLessThan(K.GRACE_MS);

    // 돌아온 화면: 카톡형 판 화면 그대로, 내 칸 산 채
    await expect(page).toHaveURL(/\/ingame/);
    await expect(talk.layout(page)).toBeVisible({ timeout: 20_000 });
    await clearOverlays(page);
    await expect(talk.strip(page).locator('[data-strip-slot]')).toHaveCount(6, { timeout: 30_000 });
    await expect(talk.mySlot(page)).toHaveAccessibleName(`${user.account.nickname}, 나`);
    await expectReadable(talk.phaseLine(page));

    // 60초(+1.5초)가 지나도 판에 산 채로 남아 있음
    await K.sleepUntil(droppedAt + K.GRACE_MS + K.SLACK_MS);
    const row = await t.player(me);
    expect(row.alive, '60초 뒤에도 산 채').toBe(true);
    expect(row.isParticipating, '60초 뒤에도 참여 중').toBe(true);
    const eliminated = t.bots.some((b) => b.events.some((r) => r.event === 'player_eliminated' && r.payload?.victimUuid === me));
    expect(eliminated, '내 탈락 알림').toBe(false);
});

test('A09-E-090 모바일 5명 판, 오프라인 61초 → 60초에 판에서 빠짐 → 온라인 → 까닭 글 + 방 목록 @game @realtime', async ({ user, table }) => {
    test.setTimeout(240_000);
    const page = user.page;
    const me = K.U(user);
    const gate = await H.socketGate(user);
    const t = await seatAtDay(table, user, 5);
    const droppedAt = await goOffline(t, user, gate);
    // 서버가 60초(±1.5초)에 탈락시킴
    const outAt = await K.eliminatedAt(t, me, droppedAt, { timeoutMs: 70_000 });
    expect(outAt - droppedAt, `끊긴 지 ${outAt - droppedAt}ms에 탈락`).toBeGreaterThanOrEqual(K.GRACE_MS - K.SLACK_MS);
    expect(outAt - droppedAt, `끊긴 지 ${outAt - droppedAt}ms에 탈락`).toBeLessThanOrEqual(K.GRACE_MS + K.SLACK_MS);
    await K.sleepUntil(droppedAt + 61_000);
    // 온라인이 되어 화면 소켓이 스스로 다시 붙으면 까닭 글(안내 창) → 닫으면 방 목록
    const text = await ui.captureAlert(page, () => gate.open(), { timeoutMs: 30_000, close: false });
    expect(text).toBe(K.FORFEIT_TEXT);
    await expectReadable(K.noticeText(page));
    await K.closeNotice(page);
    await expect(page).toHaveURL(/\/multiplay/, { timeout: 20_000 });
    await expect(page.getByRole('region', { name: '공개 방 목록' })).toBeVisible();
    expect((await t.player(me)).isParticipating).toBe(false);
});

test('A09-E-112 모바일 7명 판(투표 30), 오프라인 35초 동안 투표 마감 → 온라인 → 투표 현황에 내 표는 기권 @game @realtime', async ({ user, table }) => {
    test.setTimeout(240_000);
    const page = user.page;
    const me = K.U(user);
    const gate = await H.socketGate(user);
    const t = await K.seat(table, user, { n: 7 });
    const target = K.botOf(t, await t.state(), 'CITIZEN');
    await K.toVote(t);
    await expect(page.getByRole('button', { name: '기권' }).first()).toBeVisible({ timeout: 15_000 });
    await clearOverlays(page);
    const droppedAt = await goOffline(t, user, gate);
    // 봇 6: 둘은 target을 찍고 넷은 기권을 냄, 나는 끊겨서 못 냄
    const pickers = t.bots.filter((b) => b !== target).slice(0, 2);
    await K.botsVote(t, pickers, K.U(target));
    await K.botsVote(t, t.bots.filter((b) => !pickers.includes(b)), null);
    // 투표 마감(30초)은 손잡이 없이 지나감 (봇이 판정 알림을 받은 때)
    await expect.poll(() => target.events.some((r) => r.event === 'day_vote_resolved' && r.at >= droppedAt), {
        timeout: 40_000, message: '투표 판정 알림',
    }).toBe(true);
    const resolvedAt = target.events.find((r) => r.event === 'day_vote_resolved' && r.at >= droppedAt).at;
    expect(resolvedAt - droppedAt, '끊긴 동안 판정').toBeLessThan(35_000);

    await K.sleepUntil(droppedAt + 35_000);
    const since = Date.now();
    // 길을 열면 화면 소켓이 스스로 다시 붙음 (다음 시도까지 최대 7.5초)
    gate.open();
    const backAt = await K.returnedAt(t, me, since, { timeoutMs: 15_000 });
    expect(backAt - droppedAt, '60초 전에 돌아옴').toBeLessThan(K.GRACE_MS);

    // 찍힌 표 2 · 기권 5 (기권 낸 봇 4 + 못 낸 나 1) → 내 표가 기권에 들어 있음
    const dialog = page.getByRole('dialog', { name: '투표 현황' });
    await expect(async () => {
        if (!(await dialog.isVisible())) {
            await clearOverlays(page);
            await page.getByRole('button', { name: '투표 현황 열기' }).click({ timeout: 2000 });
        }
        await expect(dialog).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 20_000 });
    const abstain = dialog.getByTestId('vote-status-public-abstain-count');
    await expect(abstain).toHaveText('5');
    await expectReadable(abstain);
    expect((await t.player(me)).alive).toBe(true);
});
