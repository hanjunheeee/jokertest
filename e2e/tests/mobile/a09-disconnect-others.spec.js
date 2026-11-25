'use strict';

// 모바일 남이 끊기고 빠질 때 브라우저 시험 — 봇이 끊기면 플레이어 목록 그 줄에 "연결 끊김" 글과 채팅 알림 줄, 다시 붙으면 사라짐, 60초(손잡이) 탈락이면 사망·직업 안 보임, 광대 탈락이면 시민 승 결과 화면
// 목록 A09-끊김-나가기-탈주.md 번호 A09-E-054·056·057·058·060·064·110 (모바일 줄) — 60초는 손잡이로 끝냄
const { test, expect, ui } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { customRoleSettings } = require('../../helpers/game');
const { waitResult } = require('../room/roomHelpers');
const { watchSocket } = require('../ingame/c-chat/_lib');
const { talk, clearOverlays, openRoster, closeRoster, rosterRowOf, expectPlayerStatus } = require('./_talk');
const K = require('../ingame/_a09-simple-kit');

const ROLE_WORDS = Object.values(ui.ROLE_LABELS);
// 세로 카톡형엔 초상 띠가 없음 → 플레이어 목록 시트 그 사람 줄의 상태 글("연결 끊김"·"사망")로 봄 (frontend-mobile roster/RosterRow.jsx)
// 채팅 칸 알림 줄 글
const systemLine = (page, text) => talk.system(page).filter({ hasText: text }).locator('p');

// 판 앉히고 첫 낮까지, 화면이 따라오면 연출 창 닫음
async function seatAtDay(table, user, o) {
    const t = await K.seat(table, user, o);
    await K.toDay(t);
    // 명패 글 "[낮-토론과 투표]" (날짜 글 없음)
    await expect(talk.phaseLine(user.page)).toContainText('낮', { timeout: 15_000 });
    await clearOverlays(user.page);
    return t;
}

// 그 줄이 "연결 끊김": 목록 줄 상태 글이 읽힘 (글이 양피지 틀 안이라 대비는 사진으로 잼)
async function expectDropped(page, nickname) {
    await expectPlayerStatus(page, nickname, '연결 끊김');
    await openRoster(page);
    await expectReadable(rosterRowOf(page, nickname).getByText('연결 끊김', { exact: true }), { method: 'pixels' });
    await closeRoster(page);
}

// 봇 끊기 → 60초 손잡이
async function dropAndExpire(t, bot) {
    const since = Date.now();
    K.dropBot(bot);
    await K.droppedAt(t, K.U(bot), since);
    await K.expire(t, K.U(bot));
}

test('A09-E-054 모바일 7명 판, 봇이 끊기면 목록 그 줄에 "연결 끊김" @game @smoke', async ({ user, table }) => {
    const page = user.page;
    const t = await seatAtDay(table, user, { n: 7 });
    const bot = K.botOf(t, await t.state(), 'CITIZEN');
    await expectPlayerStatus(page, bot.nickname, null);
    K.dropBot(bot);
    await expectDropped(page, bot.nickname);
    // 끊겼을 뿐 죽은 건 아님
    expect((await t.player(K.U(bot))).alive).toBe(true);
});

test('A09-E-056 모바일 5명 판, 끊긴 봇이 다시 붙으면 "연결 끊김" 글이 사라짐 @game', async ({ user, table }) => {
    const page = user.page;
    const t = await seatAtDay(table, user, { n: 5 });
    const bot = K.botOf(t, await t.state(), 'CITIZEN');
    K.dropBot(bot);
    await expectDropped(page, bot.nickname);
    await K.returnBot(t, bot);
    await expectPlayerStatus(page, bot.nickname, null);
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

test('A09-E-060 모바일 8명 판, 봇 60초(손잡이) 탈락 → 목록 줄 사망, 직업은 안 보임 @game', async ({ user, table }) => {
    const page = user.page;
    // 화면 소켓이 받는 알림을 엿봄 (판에 들어갈 때 새로 열리는 소켓부터)
    const frames = watchSocket(page);
    const t = await seatAtDay(table, user, { n: 8, settings: customRoleSettings({ JOKER: 1, DOCTOR: 1 }) });
    const doctor = K.botOf(t, await t.state(), 'DOCTOR');
    await dropAndExpire(t, doctor);
    await expectPlayerStatus(page, doctor.nickname, '사망');
    // 그 줄 글에 직업 없음
    await openRoster(page);
    await expectReadable(rosterRowOf(page, doctor.nickname).getByText('사망', { exact: true }), { method: 'pixels' });
    const slotText = await rosterRowOf(page, doctor.nickname).innerText();
    for (const word of ROLE_WORDS) expect(slotText, `줄 글에 "${word}"`).not.toContain(word);
    await closeRoster(page);
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

test('A09-E-110 모바일 8명 판, 봇 2명이 끊기면 목록 두 줄마다 "연결 끊김" @game', async ({ user, table }) => {
    const page = user.page;
    const t = await seatAtDay(table, user, { n: 8 });
    const dropped = K.botsOf(t, await t.state(), 'CITIZEN').slice(0, 2);
    expect(dropped).toHaveLength(2);
    for (const bot of dropped) K.dropBot(bot);
    for (const bot of dropped) await expectDropped(page, bot.nickname);
    // 안 끊긴 사람 줄엔 "연결 끊김" 없음 (목록 전체에 딱 둘)
    const roster = await openRoster(page);
    await expect(roster.getByText('연결 끊김', { exact: true })).toHaveCount(2);
    await closeRoster(page);
});
