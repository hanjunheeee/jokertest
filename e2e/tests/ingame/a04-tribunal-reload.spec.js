'use strict';

// 재판 중 새로고침·끊김·다른 탭 브라우저 시험 (PC): 새로고침해도 재판 창이 다시 뜸(피고 글·단추·완료 글), 끊긴 채 마감이면 기권, 같은 계정 새 탭이 이어받고 옛 탭 표는 안 들어감
// 목록 docs/게임_의도_2026-11-15/시험목록/A04-재판.md A04-E-111·112·114·116·157·158
const { test, expect } = require('../../helpers/fixtures');
const K = require('./_a04-pc');

const { TEXT, uuidOf } = K;

// n명 판(사람 시민)을 1일 재판까지 → 피고는 셋째 봇(시민)
async function toTribunal(table, user, n, settings = {}) {
    const t = await K.seat(table, user, { n, settings });
    const defendant = t.bots[2];
    await K.toFirstDay(t);
    const { deadline } = await K.openTribunal(t, uuidOf(defendant));
    await K.expectTribunal(user.page, defendant.nickname);
    return { t, defendant, deadline, page: user.page };
}

test('A04-E-111 PC 5명 판 피고인 내가 재판 중 새로고침 → 재판 창이 다시 뜨고 피고 글이 읽힘 @game @smoke', async ({ user, table }) => {
    const t = await K.seat(table, user, { n: 5 });
    const page = user.page;
    await K.toFirstDay(t);
    await K.openTribunal(t, uuidOf(user));
    await K.expectTribunal(page, user.account.nickname);
    await page.reload();
    await K.expectTribunal(page, user.account.nickname);
    await K.calm(page);
    await K.expectNotice(page, TEXT.DEFENDANT);
    await K.expectNoVoteButtons(page);
});

test('A04-E-112 PC 6명 판 안 낸 내가 재판 중 새로고침 → 재판 창·단추가 다시 뜨고 누르면 서버가 받음 @game', async ({ user, table }) => {
    const { t, defendant, page } = await toTribunal(table, user, 6);
    await page.reload();
    await K.expectTribunal(page, defendant.nickname);
    await K.calm(page);
    await K.expectVoteButtons(page);
    await K.press(page, TEXT.GUILTY);
    // 봇은 아무도 안 냄 → 내 유죄 1표로 처형
    const after = await K.closeTribunal(t);
    expect(after.players.find((p) => p.uuid === uuidOf(defendant)).alive).toBe(false);
});

test('A04-E-114 PC 10명 판 낸 내가 재판 중 새로고침 → "투표가 완료되었습니다."가 읽히고 단추 없음 @game', async ({ user, table }) => {
    const { defendant, page } = await toTribunal(table, user, 10);
    await K.press(page, TEXT.NOT_GUILTY);
    await page.reload();
    await K.expectTribunal(page, defendant.nickname);
    await K.calm(page);
    await K.expectNotice(page, TEXT.DONE);
    await K.expectNoVoteButtons(page);
});

test('A04-E-116 PC 7명 판 재판 15초, 끊긴 채 마감을 넘김 → 내 표는 기권, 다시 붙으면 밤 화면 @game @realtime', async ({ user, table }) => {
    // 끊김은 화면 소켓 길목을 끊어 만듦 (브라우저 오프라인 흉내는 열린 소켓을 안 끊어 서버가 20~45초 뒤에야 앎 → 15초 마감과 엇갈림)
    const line = await K.socketLine(user);
    const { t, defendant, deadline, page } = await toTribunal(table, user, 7, { tribunalTime: 15 });
    K.expectLined(line, user);
    const cutAt = Date.now();
    await line.cut();
    // 서버가 끊김을 알아챈 때가 재판 마감 전이어야 "끊긴 채 마감"을 봄 (봇도 같은 끊김 알림을 받음)
    await t.bots[0].waitForEvent('session_player_connection_changed', {
        since: cutAt, timeoutMs: 8000, match: (p) => p?.uuid === uuidOf(user) && p.isConnected === false,
    });
    expect(Date.now(), '재판 마감 전에 끊겨야 이 규칙을 봄 (늦었으면 시험 쪽이 늦은 것)').toBeLessThan(deadline);
    // 재판 15초를 진짜로 넘김 (끊긴 지 60초 안이라 판에서는 안 빠짐)
    await K.sleepUntil(deadline + 1500);
    const s = await t.state();
    expect(s.phase).toBe('NIGHT');
    // 아무도 안 냄 + 내 표 기권 → 0 : 0 무죄
    expect(s.players.find((p) => p.uuid === uuidOf(defendant)).alive).toBe(true);
    const me = s.players.find((p) => p.uuid === uuidOf(user));
    expect(me.alive).toBe(true);
    expect(me.isParticipating).not.toBe(false);
    line.open();
    await expect(K.tribunal(page)).toBeHidden({ timeout: 30000 });
    // 다시 붙어 받은 판 값으로 밤 화면: 시간 바 단계 글이 밤, 피고 카드는 산 채
    await expect(async () => {
        await K.calm(page);
        await K.expandBar(page);
        await expect(K.timebar(page)).toContainText('[밤-', { timeout: 2000 });
    }).toPass({ timeout: 30000 });
    await K.night.expectCard(page, defendant.nickname, 'alive');
});

// 같은 브라우저(같은 쿠키) 새 탭으로 판 화면 열기, 옛 탭에 뜨는 "다른 창에서 접속" 알림은 받아 닫음
async function openSecondTab(user) {
    user.page.on('dialog', (dialog) => dialog.accept().catch(() => {}));
    const tab = await user.context.newPage();
    tab.on('dialog', (dialog) => dialog.accept().catch(() => {}));
    await tab.goto('/ingame');
    return tab;
}

test('A04-E-157 PC 6명 판 재판 중 같은 계정 새 탭 → 새 탭에 재판 창·단추 @game', async ({ user, table }) => {
    const { t, defendant } = await toTribunal(table, user, 6);
    const tab = await openSecondTab(user);
    await K.expectTribunal(tab, defendant.nickname);
    await K.calm(tab);
    await K.expectVoteButtons(tab);
    // 새 탭에서 누르면 서버가 받음 (봇은 안 냄 → 유죄 1표로 처형)
    await K.press(tab, TEXT.GUILTY);
    const after = await K.closeTribunal(t);
    expect(after.players.find((p) => p.uuid === uuidOf(defendant)).alive).toBe(false);
});

test('A04-E-158 PC 6명 판 새 탭이 이어받은 뒤 옛 탭에서 "유죄"를 누름 → 서버에 표가 안 들어감 @game', async ({ user, table }) => {
    const { t, defendant, page } = await toTribunal(table, user, 6);
    const tab = await openSecondTab(user);
    await K.expectTribunal(tab, defendant.nickname);
    await K.calm(tab);
    await K.expectVoteButtons(tab);
    // 옛 탭: 밀려난 창이라 단추가 꺼져 있을 수도 있어 그 자리를 그대로 누름
    await K.guilty(page).click({ force: true, timeout: 3000 }).catch(() => {});
    await expect(K.tribunal(page).getByText(TEXT.DONE)).toHaveCount(0);
    // 새 탭은 아직 안 낸 그대로 (옛 탭 표가 들어갔다면 새 탭도 완료 글로 바뀜)
    await K.expectVoteButtons(tab);
    // 봇도 아무도 안 냄 → 옛 탭 유죄가 들어갔다면 처형, 안 들어갔으니 무죄
    const after = await K.closeTribunal(t);
    expect(after.players.find((p) => p.uuid === uuidOf(defendant)).alive).toBe(true);
});
