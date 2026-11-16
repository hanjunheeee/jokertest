'use strict';

// 결과 화면 180초 진짜 시간 브라우저 시험 (PC, 어려움) — 손잡이 없이 기다려 로비로 가는 때·빈 방이 없어지는 때·방장 자리가 풀리는 때가 판 끝 시각 + 180초 하나인지 봄
// 목록 A08-판끝-같은방.md 번호 A08-H-031·033~039 (허용 폭 ±1.5초, 시험 하나가 3분을 넘어 그 시험 안에서만 제한을 늘림)
const { test, expect } = require('../../helpers/fixtures');
const { e2e, internal } = require('../../helpers/internal');
const { captureAlert, joinRoomByCodeUi } = require('../../helpers/ui');
const { hostGame } = require('../room/roomHelpers');
const {
    U, TEXT, startButton, hostSeat, openHumans, rolesFor, expectRoles, seatTable, seatHosted, jokerLeaves, voteOutJoker, killByNight,
    allAtResult, pressReturn, leaveToLobby, botReturn, seatsOf, expectParty, typeRoomCode, closesAtOf, secondsLeft, sleepUntil,
} = require('./_a08-hard-kit');

// 허용 폭 (ms)
const SLACK_MS = 1500;
// 닫힘 시각 앞뒤로 화면을 보는 때 (178초·182초)
const NEAR_MS = 2000;

// 서버에 그 코드 대기방이 있는지 (명단 없는 요약 — 0명 방도 보임)
async function liveRoomByCode(code) {
    return (await internal.live()).rooms.find((room) => room.code === code) ?? null;
}

test('A08-H-031 5명 판: 손잡이 없이 기다리면 남은 초가 줄다가 판 끝 + 180초에 로비로 @game @hard @realtime', async ({ user, table }) => {
    test.setTimeout(360_000);
    const page = user.page;
    const { t, joker, host } = await seatTable(table, [user], 4);
    await voteOutJoker(t, joker);
    await allAtResult([user]);
    // 서버가 정한 닫힘 시각 = 판 끝 시각 + 180초
    const closesAt = await closesAtOf(host, t.gameId);

    // 화면 남은 초 = 닫힘 시각까지 남은 시간 (±1.5초)
    const readLeft = async () => {
        const left = await secondsLeft(page);
        const real = (closesAt - Date.now()) / 1000;
        expect(Math.abs(left - real), `화면 ${left}초 · 실제 ${real.toFixed(1)}초`).toBeLessThanOrEqual(SLACK_MS / 1000);
        return left;
    };
    const first = await readLeft();
    expect(first).toBeLessThanOrEqual(180);
    await sleepUntil(closesAt - 30_000);
    expect(await readLeft(), '30초 남았을 때').toBeLessThan(first);

    await page.waitForURL(/\/lobby/, { timeout: Math.max(0, closesAt - Date.now()) + 10_000 });
    expect(Math.abs(Date.now() - closesAt), '로비로 간 때 − 닫힘 시각').toBeLessThanOrEqual(SLACK_MS);
});

test('A08-H-033 5명 판: 아무도 대기방에 안 옴 → 판 끝 + 175초엔 그 코드 방이 있고, 182초에 코드 입력하면 방 없음 글 @game @hard @realtime', async ({ user, table }) => {
    test.setTimeout(360_000);
    const page = user.page;
    const { t, joker, host } = await seatTable(table, [user], 4);
    await voteOutJoker(t, joker);
    await allAtResult([user]);
    const closesAt = await closesAtOf(host, t.gameId);

    // 봇은 결과 화면에 그대로, 사람은 로비로 가서 방 코드 화면에 코드를 적어 둠
    await leaveToLobby(page);
    await typeRoomCode(page, t.roomCode);

    await sleepUntil(closesAt - 5000);
    const before = await liveRoomByCode(t.roomCode);
    expect(before, '175초: 그 코드 방이 있음').not.toBeNull();
    expect(before.playerCount, '175초: 빈 방').toBe(0);
    expect(Date.now(), '175초 확인이 닫힘 전에 끝남').toBeLessThan(closesAt);

    await sleepUntil(closesAt + NEAR_MS);
    const text = await captureAlert(page, () => page.getByRole('button', { name: '참여하기' }).click());
    expect(text, '182초: 방 없음 글').toBe(TEXT.codeNoRoom);
    expect(text, '"이미 시작" 글이 아님').not.toContain(TEXT.started);
    expect(await liveRoomByCode(t.roomCode), '182초: 그 코드 방 없음').toBeNull();
});

test('A08-H-034 6명 판(사람 2 + 봇 4): ㄱ만 대기방으로 → 판 끝 + 182초에도 방이 남아 ㄴ이 코드로 같은 방에 들어감 @game @hard @realtime', async ({ players, table }) => {
    test.setTimeout(420_000);
    const [a, b] = await openHumans(players, 2);
    const { t, joker, host } = await seatTable(table, [a, b], 4);
    await jokerLeaves(t, joker);
    await allAtResult([a, b]);
    const closesAt = await closesAtOf(host, t.gameId);

    await pressReturn(a.page);
    await sleepUntil(closesAt + NEAR_MS);
    // 결과 화면에 남아 있던 ㄴ은 로비로 내보내졌고, 한 명이라도 있는 방은 그대로
    await expect(b.page).toHaveURL(/\/lobby/, { timeout: 1000 });
    await expect(a.page).toHaveURL(/\/game-matching/);

    await joinRoomByCodeUi(b.page, t.roomCode);
    expect(await seatsOf(U(a)), '서버 방 명단').toEqual([U(a), U(b)]);
    expect((await e2e.roomOf(U(b)))?.roomCode, '같은 방').toBe(t.roomCode);
    // 남겨 둔 방장 자리도 끝 → 먼저 들어온 ㄱ이 방장
    await expect(startButton(a.page)).toBeVisible();
});

test('A08-H-035 5명 판(사람 2 + 봇 3): ㄴ이 먼저 대기방으로, 원래 방장 ㄱ은 결과 화면 그대로 → 178초엔 ㄴ "게임시작" 없음 → 182초엔 있음, ㄱ은 로비 @game @hard @realtime', async ({ players, bots }) => {
    test.setTimeout(420_000);
    const [a, b] = await openHumans(players, 2);
    const { t, joker, botList } = await seatHosted(bots, a, [b], 3);
    await jokerLeaves(t, joker);
    await allAtResult([a, b]);
    const closesAt = await closesAtOf(botList.find((bot) => bot !== joker), t.gameId);

    await pressReturn(b.page);
    await expect(hostSeat(b.page)).toBeVisible();

    await sleepUntil(closesAt - NEAR_MS);
    await expect(startButton(b.page)).toHaveCount(0);
    await expect(a.page).toHaveURL(/\/gameresult/);
    expect(Date.now(), '178초 확인이 닫힘 전에 끝남').toBeLessThan(closesAt);

    await sleepUntil(closesAt + NEAR_MS);
    await expect(startButton(b.page)).toBeVisible({ timeout: 1000 });
    await expect(hostSeat(b.page)).toHaveCount(0);
    await expect(a.page).toHaveURL(/\/lobby/, { timeout: 1000 });
    expect((await e2e.roomOf(U(b)))?.hostUuid, '서버 방장 = ㄴ').toBe(U(b));
});

test('A08-H-036 6명 판(사람 2 + 봇 4): ㄴ이 판 끝 + 100초에 대기방으로 → 판 끝 + 182초에 ㄴ이 방장 (들어온 뒤 약 80초, 180초를 새로 안 셈) @game @hard @realtime', async ({ players, bots }) => {
    test.setTimeout(420_000);
    const [a, b] = await openHumans(players, 2);
    const { t, joker, botList } = await seatHosted(bots, a, [b], 4);
    await jokerLeaves(t, joker);
    await allAtResult([a, b]);
    const closesAt = await closesAtOf(botList.find((bot) => bot !== joker), t.gameId);

    await sleepUntil(closesAt - 80_000);
    await pressReturn(b.page);
    const enteredAt = Date.now();
    await expect(hostSeat(b.page)).toBeVisible();

    await sleepUntil(closesAt - NEAR_MS);
    await expect(startButton(b.page)).toHaveCount(0);
    expect(Date.now(), '178초 확인이 닫힘 전에 끝남').toBeLessThan(closesAt);

    await sleepUntil(closesAt + NEAR_MS);
    await expect(startButton(b.page)).toBeVisible({ timeout: 1000 });
    expect(Date.now() - enteredAt, '들어온 뒤 방장이 되기까지').toBeLessThan(90_000);
});

test('A08-H-037 6명 판(정원 6, 사람 2 + 봇 4): 원래 방장 빼고 5명 → 새 사람은 가득 참 → 판 끝 + 182초에 다시 → 들어감 @game @hard @realtime', async ({ players, bots }) => {
    test.setTimeout(480_000);
    const [a, b] = await openHumans(players, 2);
    const botList = await bots.spawn(4);
    const jokers = botList.slice(2);
    // 광대 2(뒤 봇 둘) → 두 밤에 앞 봇 둘을 암살 → 광대 승 (아무도 안 나가 봇 4가 다 돌아옴)
    const first = rolesFor([a, b], jokers);
    const t = await hostGame({
        host: a, guests: [b], botList, roles: first, settings: { maxPlayers: 6, custom: { JOKER: 2 } },
    });
    await expectRoles(t.gameId, first);
    await killByNight(t, jokers, [U(botList[0]), U(botList[1])]);
    await allAtResult([a, b]);
    const closesAt = await closesAtOf(botList[0], t.gameId);

    // 원래 방장 ㄱ은 결과 화면 그대로, 나머지 5명이 들어감 → 남겨 둔 방장 자리까지 6칸이 참
    await pressReturn(b.page);
    for (const bot of botList) await botReturn(bot, t.gameId);
    await expectParty(b.page, 5);
    const [fresh] = await bots.spawn(1);
    await expect(fresh.joinByCode(t.roomCode), '새 사람 코드 입장').rejects.toThrow(/ROOM_FULL/);

    await sleepUntil(closesAt - NEAR_MS);
    await expect(fresh.joinByCode(t.roomCode), '178초: 아직 가득 참').rejects.toThrow(/ROOM_FULL/);
    expect(Date.now(), '178초 확인이 닫힘 전에 끝남').toBeLessThan(closesAt);

    await sleepUntil(closesAt + NEAR_MS);
    await fresh.joinByCode(t.roomCode);
    await expectParty(b.page, 6);
    expect(await seatsOf(U(b)), '서버 방 명단에 새 사람').toContain(U(fresh));
    await expect(a.page).toHaveURL(/\/lobby/);
});

test('A08-H-038 6명 판(사람 2 + 봇 4): 결과 화면 ㄱ·ㄴ의 남은 초 차이가 1 이하, 60초 뒤에도 @game @hard @realtime @smoke', async ({ players, table }) => {
    test.setTimeout(300_000);
    const [a, b] = await openHumans(players, 2);
    const { t, joker, host } = await seatTable(table, [a, b], 4);
    await jokerLeaves(t, joker);
    await allAtResult([a, b]);
    const closesAt = await closesAtOf(host, t.gameId);

    // 두 화면을 같은 때 읽음: 서로 1초 안, 서버 닫힘 시각과도 ±1.5초
    const readBoth = async () => {
        const [x, y] = await Promise.all([secondsLeft(a.page), secondsLeft(b.page)]);
        const real = (closesAt - Date.now()) / 1000;
        expect(Math.abs(x - y), `두 화면 ${x}초 · ${y}초`).toBeLessThanOrEqual(1);
        for (const left of [x, y]) expect(Math.abs(left - real), `화면 ${left}초 · 실제 ${real.toFixed(1)}초`).toBeLessThanOrEqual(SLACK_MS / 1000);
        return x;
    };
    const first = await readBoth();
    const readAt = Date.now();
    await sleepUntil(readAt + 60_000);
    const later = await readBoth();
    expect(Math.abs((first - later) - 60), `60초 사이 줄어든 초 ${first - later}`).toBeLessThanOrEqual(SLACK_MS / 1000);
});

test('A08-H-039 6명 판: 남은 초가 0이 되자마자(1.5초 안) 로비로 @game @hard @realtime', async ({ user, table }) => {
    test.setTimeout(360_000);
    const page = user.page;
    const { t, joker, host } = await seatTable(table, [user], 5);
    await voteOutJoker(t, joker);
    await allAtResult([user]);
    const closesAt = await closesAtOf(host, t.gameId);

    // 화면 안에서 0.05초마다 적어 둠: 마지막으로 본 남은 초 · 0이 처음 보인 때 · 로비 주소가 된 때
    await page.evaluate(() => {
        const rec = { last: null, zeroAt: null, leftAt: null };
        window.__a08Close = rec;
        const timerId = setInterval(() => {
            const el = document.querySelector('[data-testid="result-close-timer"]');
            if (el) {
                rec.last = Number(el.getAttribute('data-seconds-left'));
                if (rec.last === 0 && rec.zeroAt === null) rec.zeroAt = Date.now();
            }
            if (window.location.pathname.startsWith('/lobby')) {
                rec.leftAt = Date.now();
                clearInterval(timerId);
            }
        }, 50);
    });

    await page.waitForURL(/\/lobby/, { timeout: Math.max(0, closesAt - Date.now()) + 10_000 });
    await expect.poll(() => page.evaluate(() => window.__a08Close.leftAt), { message: '로비로 간 때' }).not.toBeNull();
    const rec = await page.evaluate(() => window.__a08Close);

    expect(rec.last, '떠나기 직전 화면 남은 초 (0 또는 1)').toBeLessThanOrEqual(1);
    expect(Math.abs(rec.leftAt - closesAt), '닫힘 시각(= 남은 초 0) − 로비로 간 때').toBeLessThanOrEqual(SLACK_MS);
    // 화면에 0이 찍힌 적이 있으면 그때부터 1.5초 안에 떠났어야 함 (0이 찍히기 전에 떠나는 것도 맞음)
    const sinceZero = rec.zeroAt === null ? 0 : rec.leftAt - rec.zeroAt;
    expect(sinceZero, '0 표시 뒤 로비까지').toBeLessThanOrEqual(SLACK_MS);
});
