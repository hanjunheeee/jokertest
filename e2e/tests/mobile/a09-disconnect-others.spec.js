'use strict';

// 모바일 남이 끊기고 빠질 때 브라우저 시험 — 봇이 끊기면 초상 띠 카드에 "연결 끊김" 배지와 채팅 알림 줄, 다시 붙으면 사라짐, 60초(손잡이) 탈락이면 사망·직업 안 보임, 광대 탈락이면 시민 승 결과 화면
// 목록 A09-끊김-나가기-탈주.md 번호 A09-E-054·056·057·058·060·064·110 (모바일 줄) — 60초는 손잡이로 끝냄
const { test, expect, ui } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { customRoleSettings } = require('../../helpers/game');
const { waitResult } = require('../room/roomHelpers');
const { watchSocket } = require('../ingame/c-chat/_lib');
const { talk, clearOverlays } = require('./_talk');
const K = require('../ingame/_a09-simple-kit');

const ROLE_WORDS = Object.values(ui.ROLE_LABELS);
// 초상 띠의 그 사람 카드와 상태 그림
const stripCard = (page, nickname) => talk.strip(page).locator(`[data-ingame-player-nickname="${nickname}"]`);
const stripBadge = (page, nickname) => stripCard(page, nickname).locator('img[src*="ingame-status"]');
// 채팅 칸 알림 줄 글
const systemLine = (page, text) => talk.system(page).filter({ hasText: text }).locator('p');

// 판 앉히고 첫 낮까지, 화면이 따라오면 연출 창 닫음
async function seatAtDay(table, user, o) {
    const t = await K.seat(table, user, o);
    await K.toDay(t);
    await expect(talk.phaseLine(user.page)).toContainText('낮 토론', { timeout: 15_000 });
    await clearOverlays(user.page);
    return t;
}

// 그 칸이 "연결 끊김": 칸 이름·상태 값·배지 그림 (배지는 글 없는 그림이고 누름이 지나가는 층이라 보임·크기·화면 안만)
async function expectDropped(page, nickname) {
    await expect(talk.slot(page, nickname)).toHaveAccessibleName(`${nickname}, 연결 끊김`, { timeout: 15_000 });
    await expect(stripCard(page, nickname)).toHaveAttribute('data-ingame-player-status', 'disconnected');
    await expectReadable(stripBadge(page, nickname), { contrast: false, uncovered: false });
}

// 봇 끊기 → 60초 손잡이
async function dropAndExpire(t, bot) {
    const since = Date.now();
    K.dropBot(bot);
    await K.droppedAt(t, K.U(bot), since);
    await K.expire(t, K.U(bot));
}

test('A09-E-054 모바일 7명 판, 봇이 끊기면 그 카드에 "연결 끊김" 배지 @game @smoke', async ({ user, table }) => {
    const page = user.page;
    const t = await seatAtDay(table, user, { n: 7 });
    const bot = K.botOf(t, await t.state(), 'CITIZEN');
    await expect(stripCard(page, bot.nickname)).toHaveAttribute('data-ingame-player-status', 'alive');
    K.dropBot(bot);
    await expectDropped(page, bot.nickname);
    // 끊겼을 뿐 죽은 건 아님
    expect((await t.player(K.U(bot))).alive).toBe(true);
});

test('A09-E-056 모바일 5명 판, 끊긴 봇이 다시 붙으면 배지가 사라짐 @game', async ({ user, table }) => {
    const page = user.page;
    const t = await seatAtDay(table, user, { n: 5 });
    const bot = K.botOf(t, await t.state(), 'CITIZEN');
    K.dropBot(bot);
    await expectDropped(page, bot.nickname);
    await K.returnBot(t, bot);
    await expect(stripCard(page, bot.nickname)).toHaveAttribute('data-ingame-player-status', 'alive', { timeout: 15_000 });
    await expect(stripBadge(page, bot.nickname)).toHaveCount(0);
    await expect(talk.slot(page, bot.nickname)).toHaveAccessibleName(bot.nickname);
});

test('A09-E-057 모바일 6명 판, 봇이 끊기면 채팅 칸에 "○○님의 연결이 끊겼습니다" @game', async ({ user, table }) => {
    const page = user.page;
    const t = await seatAtDay(table, user, { n: 6 });
    const bot = K.botOf(t, await t.state(), 'CITIZEN');
    K.dropBot(bot);
    await expectReadable(systemLine(page, `${bot.nickname}님의 연결이 끊겼습니다`), { timeout: 15_000 });
});

test('A09-E-058 모바일 7명 판, 봇 60초(손잡이) 탈락 → 채팅 칸에 "○○님이 죽었습니다" @game', async ({ user, table }) => {
    const page = user.page;
    const t = await seatAtDay(table, user, { n: 7 });
    const bot = K.botOf(t, await t.state(), 'CITIZEN');
    await dropAndExpire(t, bot);
    await expectReadable(systemLine(page, `${bot.nickname}님이 죽었습니다`), { timeout: 15_000 });
    // 밤에 살해된 게 아니라 "살해당했습니다" 글은 아님
    await expect(talk.system(page).filter({ hasText: `${bot.nickname}님이 살해당했습니다` })).toHaveCount(0);
});

test('A09-E-060 모바일 8명 판, 봇 60초(손잡이) 탈락 → 카드 사망, 직업은 안 보임 @game', async ({ user, table }) => {
    const page = user.page;
    // 화면 소켓이 받는 알림을 엿봄 (판에 들어갈 때 새로 열리는 소켓부터)
    const frames = watchSocket(page);
    const t = await seatAtDay(table, user, { n: 8, settings: customRoleSettings({ JOKER: 1, DOCTOR: 1 }) });
    const doctor = K.botOf(t, await t.state(), 'DOCTOR');
    await dropAndExpire(t, doctor);
    await expect(talk.slot(page, doctor.nickname)).toHaveAccessibleName(`${doctor.nickname}, 사망`, { timeout: 15_000 });
    await expect(stripCard(page, doctor.nickname)).toHaveAttribute('data-ingame-player-status', 'dead');
    await expectReadable(stripBadge(page, doctor.nickname), { contrast: false, uncovered: false });
    // 그 칸 글에 직업 없음
    const slotText = await talk.slot(page, doctor.nickname).innerText();
    for (const word of ROLE_WORDS) expect(slotText, `칸 글에 "${word}"`).not.toContain(word);
    // 화면이 받은 탈락 알림에도 그 사람 직업이 없음 (의사는 이 판에 그 봇 하나)
    await expect.poll(() => frames.some((f) => f.event === 'player_eliminated' && f.payload?.victimUuid === K.U(doctor)), { timeout: 10_000 }).toBe(true);
    expect(JSON.stringify(frames.filter((f) => f.event === 'player_eliminated'))).not.toContain('DOCTOR');
    expect((await t.state()).phase, '승부가 안 났으니 판 계속').not.toBe('ENDED');
});

test('A09-E-064 모바일 6명 판, 광대 봇 60초(손잡이) 탈락 → 시민 승 결과 화면 @game', async ({ user, table }) => {
    const page = user.page;
    const t = await seatAtDay(table, user, { n: 6 });
    const joker = K.botOf(t, await t.state(), 'JOKER');
    await dropAndExpire(t, joker);
    await waitResult(page);
    // 결과판 1.5초 뒤 뜨는 전면 광고 창이 글을 덮음 → 닫고 봄 (광고를 못 불러와 저절로 닫힌 것도 닫힌 것으로 침)
    await K.closeAd(page);
    await expectReadable(page.getByText('시민 진영 승리', { exact: true }));
    // 나는 시민이라 승리
    await expect(page.getByText(/^(승리|패배)$/)).toHaveText('승리');
});

test('A09-E-110 모바일 8명 판, 봇 2명이 끊기면 배지마다 보임 @game', async ({ user, table }) => {
    const page = user.page;
    const t = await seatAtDay(table, user, { n: 8 });
    const dropped = K.botsOf(t, await t.state(), 'CITIZEN').slice(0, 2);
    expect(dropped).toHaveLength(2);
    for (const bot of dropped) K.dropBot(bot);
    for (const bot of dropped) await expectDropped(page, bot.nickname);
    // 안 끊긴 사람 칸엔 배지 없음
    await expect(talk.strip(page).locator('[data-ingame-player-status="disconnected"]')).toHaveCount(2);
});
