'use strict';

// 결과 화면 180초 타이머 브라우저 시험 (PC) — 우측 상단 남은 시간이 읽힘·줄어듦·판 끝 시각부터 셈, 닫히면 로비로·방 만들기 됨, 대기방에 들어간 사람은 안 닫힘
// 목록 A08-판끝-같은방.md 번호 A08-E-001~006·074 (180초는 손잡이 closeResults로 넘김, 180초를 진짜로 기다리는 건 A08-H-031~040 몫)
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { closeReveals, waitResult, createRoomUi, waitRoom, sleep } = require('../room/roomHelpers');
const N = require('../ingame/b-night/_night');

const U = (x) => x.account.uuid;
const closeTimer = (page) => page.getByTestId('result-close-timer');
// 타이머 칸에 적힌 남은 초 (data-seconds-left)
const secondsLeft = async (page) => Number(await closeTimer(page).getAttribute('data-seconds-left'));
// 진짜 시간 허용 폭 ±1.5초 (시험_계획 3-5)
const SLACK_SEC = 1.5;

/**
 * 봇 방장 판 차리기 (사람 1 + 봇 total-1): 사람은 시민, 봇들은 광대 봇을 찍고 유죄 → 단계만 넘기면 시민 승으로 끝남
 * 사람은 표를 안 냄(기권) — 봇 표가 기권보다 많아야 재판이라 시작 전에 셈을 봄
 * @returns {Promise<{ t:any, host:any, joker:any }>} host = 방장 봇, joker = 처형될 광대 봇
 */
async function openGame({ user, table, total }) {
    const t = await table.setup({
        humans: [user],
        bots: total - 1,
        roles: ({ humans, bots }) => ({ [U(humans[0])]: 'CITIZEN', [U(bots.at(-1))]: 'JOKER' }),
    });
    // 미리 정한 직업이 가끔 안 맞음 → 서버 값으로 광대 봇을 다시 찾음
    const s = await t.state();
    const jokerUuid = s.players.find((p) => p.role === 'JOKER')?.uuid;
    const joker = t.bots.find((bot) => U(bot) === jokerUuid);
    expect(joker, '광대는 봇이어야 함 (사람은 시민)').toBeTruthy();
    await t.assertBotsCanExecute(jokerUuid);
    t.playBots((bot) => ({ dayVote: bot === joker ? 'abstain' : jokerUuid, tribunal: 'GUILTY', night: 'skip' }));
    await closeReveals([user.page]);
    return { t, host: t.bots[0], joker };
}

// 판 끝까지 넘기고 사람 화면이 결과 화면이 될 때까지
async function playToResult({ user, table, total }) {
    const game = await openGame({ user, table, total });
    await N.toEnd(game.t);
    await waitResult(user.page);
    return game;
}

test('A08-E-001 5명 판 끝 → 결과 영상 뒤 우측 상단 타이머가 읽힘, 숫자 1~180 @game @smoke', async ({ user, table }) => {
    await playToResult({ user, table, total: 5 });
    const page = user.page;

    // "있다"가 아니라 "보인다": 크기·화면 안·안 가려짐·대비
    await expectReadable(closeTimer(page));
    await expect(closeTimer(page)).toContainText(/\d+초/);
    const left = await secondsLeft(page);
    expect(left).toBeGreaterThanOrEqual(1);
    expect(left).toBeLessThanOrEqual(180);
});

test('A08-E-002 6명 판 결과 화면: 3초 기다리면 남은 초가 2~4 줄어듦 @game', async ({ user, table }) => {
    await playToResult({ user, table, total: 6 });
    const page = user.page;
    await expect(closeTimer(page)).toBeVisible();

    const before = await secondsLeft(page);
    // 타이머가 진짜 시간으로 가는지 보는 것이라 3초는 그대로 기다림 (손잡이 없음)
    await page.waitForTimeout(3000);
    const after = await secondsLeft(page);

    expect(before - after).toBeGreaterThanOrEqual(2);
    expect(before - after).toBeLessThanOrEqual(4);
});

test('A08-E-003 7명 판 결과 화면: 타이머 가운데가 창 오른쪽 절반·위쪽 4분의 1 안 @game', async ({ user, table }) => {
    await playToResult({ user, table, total: 7 });
    const page = user.page;
    await expect(closeTimer(page)).toBeVisible();

    const box = await closeTimer(page).boundingBox();
    const view = page.viewportSize();
    expect(box, '타이머 칸 자리').not.toBeNull();
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    expect(centerX).toBeGreaterThan(view.width / 2);
    expect(centerX).toBeLessThanOrEqual(view.width);
    expect(centerY).toBeGreaterThanOrEqual(0);
    expect(centerY).toBeLessThan(view.height / 4);
});

test('A08-E-004 5명 판: 결과 영상을 보는 동안도 시간이 감 → 영상 뒤 타이머 = 180 − 판 끝 뒤 지난 초 (±1.5) @game', async ({ user, table }) => {
    const { t } = await openGame({ user, table, total: 5 });
    const page = user.page;

    // 판 끝 시각을 시험이 따로 잼: 0.1초마다 서버 판 값을 보고 "아직 안 끝남"을 본 마지막 때 ~ "끝남"을 처음 본 때의 가운데
    let lastLiveAt = Date.now();
    let endedSeenAt = null;
    let stop = false;
    const watch = (async () => {
        while (!stop) {
            const askedAt = Date.now();
            const s = await t.state();
            if (!s || s.phase === 'ENDED') { endedSeenAt = Date.now(); return; }
            lastLiveAt = askedAt;
            await sleep(100);
        }
    })();
    try {
        await N.toEnd(t);
        await expect.poll(() => endedSeenAt, { message: '판 끝을 못 봄' }).not.toBeNull();
    } finally {
        stop = true;
        await watch;
    }
    const endedAt = (lastLiveAt + endedSeenAt) / 2;

    await waitResult(page);
    await expect(closeTimer(page)).toBeVisible();
    const shown = await secondsLeft(page);
    const passedSec = (Date.now() - endedAt) / 1000;

    // 영상이 끝난 때부터 180을 새로 세면 여기서 걸림 (판 끝 시각부터 하나의 시계)
    expect(Math.abs(shown - (180 - passedSec))).toBeLessThanOrEqual(SLACK_SEC);
});

test('A08-E-005 6명 판 결과 화면: 결과 닫기 손잡이 → 주소가 로비로 @game', async ({ user, table }) => {
    const { t } = await playToResult({ user, table, total: 6 });
    const page = user.page;

    const closed = await t.closeResults();
    expect(closed.fired).toBe(true);
    await expect(page).toHaveURL(/\/lobby/, { timeout: 15_000 });
});

test('A08-E-006 5명 판 결과 화면이 닫힌 뒤 로비에서 방 만들기 → 대기방 열림 @game', async ({ user, table }) => {
    const { t } = await playToResult({ user, table, total: 5 });
    const page = user.page;

    const closed = await t.closeResults();
    expect(closed.fired).toBe(true);
    await expect(page).toHaveURL(/\/lobby/, { timeout: 15_000 });

    // 끝난 판에 묶여 있으면 방 만들기가 거절됨 → 화면으로 만들어 대기방까지 가는지
    const room = await createRoomUi(user);
    await expect(page).toHaveURL(/\/game-matching/);
    expect(room.hostUuid).toBe(U(user));
    expect(room.players.map((p) => p.uuid)).toEqual([U(user)]);
});

test('A08-E-074 5명 판: 대기방으로 들어간 사람은 결과 닫힘에 안 끌려감 → 주소 대기방 그대로 @game', async ({ user, table }) => {
    const { t, host } = await playToResult({ user, table, total: 5 });
    const page = user.page;

    await page.getByRole('button', { name: '대기방으로' }).click();
    await expect(page).toHaveURL(/\/game-matching/, { timeout: 20_000 });

    const closed = await t.closeResults();
    expect(closed.fired).toBe(true);
    // 닫힘이 실제로 돌았는지: 결과 화면에 남아 있던 방장 봇은 닫힘 알림을 받음
    await host.waitForEvent('game_result_closed', { timeoutMs: 15_000 });

    // 대기방 사람은 그대로 (닫힘과 같은 때 방장 자리 남김이 끝나 먼저 들어온 사람 = 나에게 시작 단추가 생김)
    await expect(page.getByRole('button', { name: '게임시작' })).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(/\/game-matching/);
    const room = await waitRoom(U(user), (r) => r.hostUuid === U(user));
    expect(room.roomCode).toBe(t.roomCode);
});
