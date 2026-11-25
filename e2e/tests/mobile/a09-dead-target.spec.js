'use strict';

// [B07-1] 모바일 죽고 끊긴 사람 카드 브라우저 시험 — 처형된 뒤 끊긴 봇은 다음 낮 투표 대상이 아니고, 마녀사냥꾼은 밤에 그 카드를 고를 수 있음
// 목록 A09-끊김-나가기-탈주.md 번호 A09-E-070·072 (모바일 줄) — 죽고 끊긴 사람이 "산 사람"으로 취급되던 버그를 고친 뒤 모습
const { test, expect } = require('../../helpers/fixtures');
const { customRoleSettings } = require('../../helpers/game');
const { toTurn } = require('../ingame/b-night/_night');
const { talk, clearOverlays, openPlayer, closeRoster } = require('./_talk');
const K = require('../ingame/_a09-simple-kit');

// 세로 카톡형: 카드 띠 대신 플레이어 목록 시트(밤엔 "직업 행동")의 그 사람 줄 열기 (연출 창이 막으면 닫으면서 다시)
async function openSheet(page, nickname) {
    let row = null;
    await expect(async () => {
        await clearOverlays(page);
        row = await openPlayer(page, nickname);
    }).toPass({ timeout: 25_000 });
    return row;
}

const closeSheet = (page) => closeRoster(page);

// 그 사람 줄에서 눌러지는 "투표하기" 항목 수
async function pressableVoteItems(page, nickname) {
    const sheet = await openSheet(page, nickname);
    const count = await sheet.locator('[role="menuitem"][aria-label="투표하기"]:not([disabled])').count();
    await closeSheet(page);
    return count;
}

// 봇 하나를 처형한 뒤 그 봇 소켓을 끊음 (죽고 끊긴 사람)
async function executeThenDrop(t, bot) {
    await K.execute(t, K.U(bot));
    const since = Date.now();
    K.dropBot(bot);
    await K.droppedAt(t, K.U(bot), since);
}

test('A09-E-070 [B07-1] 모바일 8명 판, 죽고 끊긴 봇 카드에 다음 낮 "투표하기"가 안 눌러짐 @game @smoke', async ({ user, table }) => {
    test.setTimeout(180_000);
    const page = user.page;
    const t = await K.seat(table, user, { n: 8 });
    const [dead, living] = K.botsOf(t, await t.state(), 'CITIZEN');
    await executeThenDrop(t, dead);
    await K.pastExpulsion(page);
    // 다음 날(2일) 낮 투표
    const s = await K.toVote(t);
    expect(s.dayIndex).toBe(2);
    expect(K.rowOf(s, K.U(dead)).alive).toBe(false);
    await expect(talk.phaseLine(page)).toContainText('제 2일', { timeout: 15_000 });
    await expect(page.getByRole('button', { name: '기권' }).first()).toBeVisible({ timeout: 15_000 });
    // 산 봇 카드엔 눌러지는 "투표하기"가 있음 (시트 읽는 법이 맞는지 먼저 봄)
    expect(await pressableVoteItems(page, living.nickname), '산 봇 카드의 투표하기').toBe(1);
    expect(await pressableVoteItems(page, dead.nickname), '죽고 끊긴 봇 카드의 투표하기').toBe(0);
});

test('A09-E-072 [B07-1] 모바일 10명 판 마녀사냥꾼, 둘째 밤 내 차례에 죽고 끊긴 봇 카드를 고를 수 있음 @game', async ({ user, table }) => {
    test.setTimeout(240_000);
    const page = user.page;
    const t = await K.seat(table, user, { n: 10, role: 'WITCH_HUNTER', settings: customRoleSettings({ JOKER: 1, WITCH_HUNTER: 1 }) });
    const dead = K.botOf(t, await t.state(), 'CITIZEN');
    await executeThenDrop(t, dead);
    await K.pastExpulsion(page);
    // 마녀사냥꾼 차례는 둘째 밤부터 (첫 밤엔 차례 없음)
    await toTurn(t, 'WITCH_HUNTER', { dayIndex: 2 });
    await expect(talk.phaseLine(page)).toContainText('밤', { timeout: 15_000 });
    const sheet = await openSheet(page, dead.nickname);
    const pick = sheet.getByRole('menuitem', { name: '확인', exact: true });
    await expect(pick).toBeEnabled();
    await pick.click();
    // 서버가 받으면 같은 줄이 "취소하기"로 바뀜
    await expect(async () => {
        const again = await openSheet(page, dead.nickname);
        await expect(again.getByRole('menuitem', { name: '취소하기', exact: true })).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 15_000 });
});
