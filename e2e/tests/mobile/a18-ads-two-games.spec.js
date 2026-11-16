'use strict';

// 한 판 끝 광고는 판마다 한 번 브라우저 시험 (모바일, 같은 방 두 판) — 첫 판 결과에 1번, 같은 방 둘째 판 결과에 다시 1번, 닫은 뒤엔 다시 안 뜸
// 목록 A18-설정-배포-광고.md 번호 A18-H-010 — 광고 꾸러미 요청은 가짜로 바꾸고 다른 광고 주소는 막음, 돌리지 않고 모임만: npx playwright test --list --no-deps tests/mobile/a18-ads-two-games.spec.js
const { test, expect, ui, e2e } = require('../../helpers/fixtures');
const { Table } = require('../../helpers/game');
const { sleep } = require('../../helpers/wait');
const { playToResult, finishGame, waitResult, closeReveals } = require('../room/roomHelpers');
const K = require('../maintenance/_a18-kit');

// 광고를 닫은 뒤 다시 안 뜨는지 지켜보는 시간 (열림 늦춤 1.5초보다 넉넉히)
const WATCH_MS = 4000;

/** 결과 화면에서 광고 창이 한 번 뜸 → 5초 뒤 닫기 → 지켜보는 동안 다시 안 뜸 */
async function adOnceThenGone(page) {
    await expect(K.adDialog(page)).toHaveCount(1, { timeout: 10_000 });
    await expect(K.adClose(page)).toBeVisible({ timeout: 10_000 });
    await K.adClose(page).click();
    await expect(K.adDialog(page)).toHaveCount(0);
    // 같은 판에 다시 안 뜸 (뜨지 않는 것을 보는 거라 정해진 시간만큼 지켜봄)
    await sleep(WATCH_MS);
    await expect(K.adDialog(page)).toHaveCount(0);
}

test('A18-H-010 모바일 5명 판(사람 1 + 봇 4) 두 번: 첫 판 결과 광고 1번 → 닫고 "대기방으로" → 같은 방 둘째 판 결과 광고 다시 1번, 닫은 뒤 다시 안 뜸 @game @hard @smoke', async ({ players, table }) => {
    test.setTimeout(300_000);
    const phone = await K.openPhone(players);
    const page = phone.page;

    // 첫 판: 봇 광대 처형 → 시민 승 → 결과 화면
    const { t } = await playToResult({ user: phone, table, kind: 'citizenWin' });
    await adOnceThenGone(page);

    // 봇 전원(원래 방장부터) 대기방으로·준비, 사람도 "대기방으로"·준비 → 같은 방
    const [host] = t.bots;
    let room = null;
    for (const bot of t.bots) {
        const reply = await bot.request('return_to_room', { gameId: t.gameId });
        expect(reply?.ok, `봇 대기방으로 답 ${JSON.stringify(reply)}`).toBe(true);
        room = reply.room;
    }
    // 같은 방 = 같은 방 코드 (판 끝에 같은 코드로 다시 열고 방 id는 새로 뽑음, 결정「판 끝 뒤 대기방으로 — 방 코드」)
    expect(room.roomCode, '같은 방 코드').toBe(t.roomCode);
    for (const bot of t.bots) await bot.setReady(room.roomId, room.settingsVersion);
    await page.getByRole('button', { name: '대기방으로', exact: true }).click();
    await expect(page).toHaveURL(/\/game-matching/, { timeout: 20_000 });
    await ui.readyUi(page);
    await expect(page.getByRole('button', { name: '준비취소' })).toBeVisible();

    // 둘째 판: 직업 같게 정함 (사람 시민·첫 봇 광대) → 봇 표로 광대 처형
    const joker = t.bots[0];
    await e2e.setRoles(Object.fromEntries([[K.U(phone), 'CITIZEN'], ...t.bots.map((b) => [K.U(b), b === joker ? 'JOKER' : 'CITIZEN'])]), { roomId: room.roomId });
    const started = await host.startGame(room.roomId, room.settingsVersion);
    expect(started.gameId, '새 판').not.toBe(t.gameId);
    await expect(page).toHaveURL(/\/ingame/, { timeout: 20_000 });
    const t2 = new Table({ room, bots: t.bots, humans: [phone] });
    t2.gameId = started.gameId;
    const s2 = await t2.state();
    expect(s2.players.find((p) => p.uuid === K.U(joker))?.role, '둘째 판 광대').toBe('JOKER');
    await t2.assertBotsCanExecute(K.U(joker));
    t2.playBots((bot) => ({ dayVote: bot === joker ? 'abstain' : K.U(joker), tribunal: 'GUILTY', night: 'skip' }));
    try {
        await closeReveals([page]);
        await finishGame(t2, { stepDelayMs: 1200 });
        await waitResult(page);
        // 판이 다르므로 다시 1번, 닫은 뒤엔 안 뜸
        await adOnceThenGone(page);
    } finally {
        await t2.stopBots();
    }
});
