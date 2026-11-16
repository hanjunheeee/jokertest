'use strict';

// 죽은 사람 풀기 어려운 브라우저 시험 (PC, 사람 2~4명) — 처형된 사람이 새 판 시작·죽고 끊긴 카드 [B07-1]·관전 중 새로고침·죽고 나가도 골드·다른 대기방에 있는 동안 옛 판 끝
// 목록 A09-끊김-나가기-탈주.md A09-H-020·022·023·036·037·053 — 모이는지만: npx playwright test --list tests/ingame/a09-dead-release-multi.spec.js
const { test, expect, ui, e2e } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { botsJoinAndReady } = require('../room/roomHelpers');
const night = require('./b-night/_night');
const c = require('./c-chat/_lib');
const A = require('./_a04-multi');
const K = require('./_a09-simple-kit');
const H = require('./_a09-hard-kit');

const { U, nick } = H;

// 탭 닫기 → 서버가 끊김을 알 때까지
async function closeTab(t, person) {
    const since = Date.now();
    await person.page.close();
    return K.droppedAt(t, U(person), since);
}

test('A09-H-020 처형된 ㄱ이 탭을 닫고 새 방에서 ㄴ·ㄷ·봇 2와 새 5명 판 시작 → 옛 7명 판(ㄹ + 봇 5) ㄹ 화면이 ㄱ 빠짐 알림을 받음, ㄱ 새 화면엔 옛 판 알림 없음 @game @hard', async ({ user, players, table, bots }) => {
    test.setTimeout(300_000);
    const [a, b, cc, d] = await H.openPeople(user, players, 4);
    // ㄹ 화면이 받는 알림 (판에 들어가며 새로 열리는 소켓부터)
    const seenByD = c.watchSocket(d.page);
    const old = await H.seat(table, [a, d], { n: 7 });
    await H.execute(old, U(a));
    await closeTab(old, a);

    // ㄱ 새 탭: 옛 판 알림이 오는지 지켜봄 → 새 방 → ㄴ·ㄷ·봇 2 입장·준비 → 직업 정하고 시작
    const tab = await a.context.newPage();
    const seenByA = c.watchSocket(tab);
    H.collectDialogs(tab);
    const fresh = { ...a, page: tab };
    const room = await A.createRoomFromLobby(fresh);
    for (const p of [b, cc]) await ui.joinRoomByCodeUi(p.page, room.roomCode);
    for (const p of [b, cc]) {
        await ui.readyUi(p.page);
        await expect(p.page.getByRole('button', { name: '준비취소' })).toBeVisible();
    }
    const [j, n] = await bots.spawn(2);
    await botsJoinAndReady([j, n], U(a), room.roomCode);
    await e2e.setRoles({ [U(a)]: 'CITIZEN', [U(b)]: 'CITIZEN', [U(cc)]: 'CITIZEN', [U(j)]: 'JOKER', [U(n)]: 'CITIZEN' }, { roomId: room.roomId });
    await ui.readyUi(tab);
    await expect(tab.getByRole('button', { name: '준비취소' })).toBeVisible();
    await tab.getByRole('button', { name: '게임시작' }).click();
    for (const p of [tab, b.page, cc.page]) await expect(p).toHaveURL(/\/ingame/, { timeout: 20_000 });
    const now = await e2e.gameOf(U(a));
    expect(now.gameId, '새 판').not.toBe(old.gameId);

    // 옛 판: ㄱ 판 자리 풀림 (서버) + ㄹ 화면이 "ㄱ 빠짐" 참여 바뀜 알림을 받음
    await expect.poll(async () => (await old.player(U(a)))?.isParticipating, { timeout: 15_000, message: '옛 판에서 ㄱ 빠짐' }).toBe(false);
    await expect.poll(
        () => seenByD.some((f) => f.event === 'session_participation_changed' && f.payload?.gameId === old.gameId && f.payload?.departedUuid === U(a)),
        { timeout: 15_000, message: 'ㄹ 화면이 받은 참여 바뀜 알림' },
    ).toBe(true);
    // 옛 판이 한 단계 더 가도 ㄱ 새 화면엔 옛 판 알림이 안 옴
    await old.advance();
    await expect.poll(async () => seenByD.filter((f) => f.payload?.gameId === old.gameId).length, { timeout: 10_000 }).toBeGreaterThan(1);
    expect(seenByA.filter((f) => f.payload?.gameId === old.gameId), 'ㄱ 새 화면이 받은 옛 판 알림').toEqual([]);
    await expect(tab).toHaveURL(/\/ingame/);
});

test('A09-H-022 [B07-1] 7명 판(사람 2 + 봇 5) 처형된 ㄱ이 탭을 닫음 → 다음 낮 ㄴ 화면 ㄱ 카드에 "투표하기" 없음 @game @hard', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    const [a, b] = await H.openPeople(user, players, 2);
    const t = await H.seat(table, [a, b], { n: 7 });
    await H.execute(t, U(a));
    await closeTab(t, a);
    // 밤은 아무도 안 죽임 → 둘째 낮 투표
    await H.toVote(t, [b.page], 2);
    await H.expectNoVoteItem(b.page, nick(a));
    // 죽은 채 판 자리는 남음 (끊겨도 다른 방만 풀림)
    const row = await t.player(U(a));
    expect(row.alive).toBe(false);
    expect(row.isParticipating).toBe(true);
});

test('A09-H-023 [B07-1] 10명 판(사람 3 + 봇 7) 처형된 ㄱ이 탭을 닫음 → 둘째 밤 마녀사냥꾼 ㄷ이 ㄱ 카드를 확인 → 낮에 결과 창(ㄱ 닉네임·"시민입니다") @game @hard', async ({ user, players, table }) => {
    test.setTimeout(300_000);
    const [a, b, cc] = await H.openPeople(user, players, 3);
    const t = await H.seat(table, [a, b, cc], { n: 10, humanRoles: ['CITIZEN', 'CITIZEN', 'WITCH_HUNTER'] });
    await H.execute(t, U(a));
    await closeTab(t, a);
    await night.toTurn(t, 'WITCH_HUNTER', { dayIndex: 2 });
    await night.nightActUi(cc.page, nick(a), night.ACTION_LABELS.WITCH_HUNTER);
    await night.toDay(t, { dayIndex: 3 });
    // 결과 창은 낮 시작 연출 뒤에 뜸 → 다른 안내 창만 닫으며 기다림 (결과 창 자체는 안 닫음)
    const dialog = cc.page.locator('[data-ingame-night-private-result="CONFIRM"]').getByRole('dialog', { name: '밤 조사 결과' });
    await A.calm(cc.page, () => expect(dialog).toBeVisible({ timeout: 1000 }), { names: ['단계 전환 안내', '밤 역할 안내', '알림', '내 역할 보기'], timeout: 45_000 });
    await expect(dialog).toContainText(nick(a));
    await expect(dialog).toContainText('시민입니다');
    await expectReadable(dialog.getByRole('paragraph').first());
});

test('A09-H-036 7명 판(사람 2 + 봇 5) 처형된 ㄴ이 관전 중 새로고침 → ㄴ 판 그대로 관전, ㄱ 화면 ㄴ 카드 끊김 → 돌아옴 @game @hard', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    const [a, b] = await H.openPeople(user, players, 2);
    const t = await H.seat(table, [a, b], { n: 7 });
    await H.execute(t, U(b));
    await A.keepWatching(b.page);
    await A.calm(a.page);
    await H.watchStatus(a.page, nick(b));

    await H.reloadIngame(b.page, 7);
    const dialog = await K.waitDeadChoice(b.page);
    await dialog.getByRole('button', { name: '관전 계속하기' }).click();
    await expect(dialog).toBeHidden();
    await expect(b.page).toHaveURL(/\/ingame/);
    const row = await t.player(U(b));
    expect(row.alive).toBe(false);
    expect(row.isParticipating, '관전 중 새로고침해도 판 자리 그대로').toBe(true);
    // ㄱ 화면: 새로고침 동안 끊김 표시 → 다시 사망 표시 (죽고 끊긴 카드는 끊김이 먼저 보임 [지금 동작])
    await expect.poll(() => H.statusSeen(a.page, nick(b)), { timeout: 15_000 }).toEqual(['dead', 'disconnected', 'dead']);
});

test('A09-H-037 8명 판(사람 2 + 봇 6) 처형된 ㄴ이 나감 → 판 끝(시민 승) → ㄴ 지갑 +1골드 @game @hard @smoke', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    const [a, b] = await H.openPeople(user, players, 2);
    const t = await H.seat(table, [a, b], { n: 8 });
    const before = await H.gold(U(b));
    await H.execute(t, U(b));
    await K.pressDeadExit(b.page, { accept: true });
    await expect(b.page).toHaveURL(/\/multiplay/, { timeout: 15_000 });
    // 다음 낮 광대 봇 처형 → 시민 승
    const [joker] = await H.botsBy(t, 'JOKER');
    const end = await H.execute(t, U(joker));
    expect(end.phase).toBe('ENDED');
    await expect.poll(() => H.gold(U(b)), { timeout: 30_000, message: '죽고 나간 ㄴ 지갑' }).toBe(before + 1);
});

test('A09-H-053 [지금 동작] 7명 판(사람 2 + 봇 5) 처형된 ㄴ이 다른 대기방에 있는 동안 옛 판 끝 → ㄴ 화면 대기방 그대로 @game @hard', async ({ user, players, table, bots }) => {
    test.setTimeout(240_000);
    const [a, b] = await H.openPeople(user, players, 2);
    const t = await H.seat(table, [a, b], { n: 7 });
    await H.execute(t, U(b));
    await K.pressDeadExit(b.page, { accept: true });
    await expect(b.page).toHaveURL(/\/multiplay/, { timeout: 15_000 });
    const [host] = await bots.spawn(1);
    const room = await host.createRoom();
    await ui.joinRoomByCodeUi(b.page, room.roomCode);

    // 옛 판 끝: 광대 봇 처형 → 시민 승, ㄱ이 결과 화면까지 간 뒤에 ㄴ 화면을 봄 (옛 판 끝 알림이 다 퍼진 뒤)
    const [joker] = await H.botsBy(t, 'JOKER');
    const end = await H.execute(t, U(joker));
    expect(end.phase).toBe('ENDED');
    await A.expectResult(a.page, H.TEXT.citizenWin);
    await expect(b.page).toHaveURL(/\/game-matching/);
    await expect(b.page.getByText('파티 인원 2명')).toBeVisible();
    expect((await e2e.roomOf(U(b)))?.roomId, 'ㄴ은 새 대기방 그대로').toBe(room.roomId);
});
