'use strict';

// [B07-1] 죽고 끊긴 사람 카드 브라우저 시험 (PC) — 처형된 뒤 탭을 닫은(끊긴) 봇은 다음 낮 투표 대상이 아니고, 마녀사냥꾼은 밤에 그 카드를 고를 수 있음
// 목록 A09-끊김-나가기-탈주.md 번호 A09-E-069·071 (PC 줄) — 죽고 끊긴 사람이 "산 사람"으로 취급되던 버그를 고친 뒤 모습
const { test, expect } = require('../../helpers/fixtures');
const { customRoleSettings } = require('../../helpers/game');
const night = require('./b-night/_night');
const K = require('./_a09-simple-kit');

const menuOf = (page) => page.getByRole('menu', { name: '플레이어 행동' });

// 카드를 눌러 본 뒤 눌러지는 "투표하기" 항목 수 (메뉴가 안 열려도 0), 끝나면 메뉴 닫음
async function pressableVoteItems(page, nickname) {
    await expect(async () => {
        await K.clear(page);
        await night.cardButton(page, nickname).click({ timeout: 1500 });
    }).toPass({ timeout: 20_000 });
    await menuOf(page).waitFor({ state: 'visible', timeout: 2000 }).catch(() => {});
    const count = await page.locator('[role="menuitem"][aria-label="투표하기"]:not([disabled])').count();
    await page.keyboard.press('Escape');
    await expect(menuOf(page)).toBeHidden();
    return count;
}

// 봇 하나를 처형한 뒤 그 봇 소켓을 끊음 (죽고 끊긴 사람)
async function executeThenDrop(t, bot) {
    await K.execute(t, K.U(bot));
    const since = Date.now();
    K.dropBot(bot);
    await K.droppedAt(t, K.U(bot), since);
}

test('A09-E-069 [B07-1] PC 7명 판, 죽고 끊긴 봇 카드에 다음 낮 "투표하기"가 안 눌러짐 @game @smoke', async ({ user, table }) => {
    test.setTimeout(180_000);
    const page = user.page;
    const t = await K.seat(table, user, { n: 7 });
    const [dead, living] = K.botsOf(t, await t.state(), 'CITIZEN');
    await executeThenDrop(t, dead);
    await K.pastExpulsion(page);
    // 다음 날(2일) 낮 투표
    const s = await K.toVote(t);
    expect(s.dayIndex).toBe(2);
    expect(K.rowOf(s, K.U(dead)).alive).toBe(false);
    await K.clear(page);
    await expect(page.getByRole('button', { name: '기권' })).toBeVisible({ timeout: 15_000 });
    // 산 봇 카드엔 눌러지는 "투표하기"가 있음 (메뉴 읽는 법이 맞는지 먼저 봄)
    expect(await pressableVoteItems(page, living.nickname), '산 봇 카드의 투표하기').toBe(1);
    expect(await pressableVoteItems(page, dead.nickname), '죽고 끊긴 봇 카드의 투표하기').toBe(0);
});

test('A09-E-071 [B07-1] PC 10명 판 마녀사냥꾼, 둘째 밤 내 차례에 죽고 끊긴 봇 카드를 고를 수 있음 @game', async ({ user, table }) => {
    test.setTimeout(240_000);
    const page = user.page;
    const t = await K.seat(table, user, { n: 10, role: 'WITCH_HUNTER', settings: customRoleSettings({ JOKER: 1, WITCH_HUNTER: 1 }) });
    const dead = K.botOf(t, await t.state(), 'CITIZEN');
    await executeThenDrop(t, dead);
    await K.pastExpulsion(page);
    // 마녀사냥꾼 차례는 둘째 밤부터 (첫 밤엔 차례 없음)
    await night.toTurn(t, 'WITCH_HUNTER', { dayIndex: 2 });
    await night.nightActUi(page, dead.nickname, '확인');
    // 서버가 받으면 같은 카드 메뉴가 "취소하기"로 바뀜
    await expect(async () => {
        const menu = await night.openCardMenu(page, dead.nickname, { timeout: 5000 });
        await expect(menu.getByRole('menuitem', { name: '취소하기', exact: true })).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 15_000 });
});
