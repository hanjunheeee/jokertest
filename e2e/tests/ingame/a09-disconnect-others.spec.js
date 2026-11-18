'use strict';

// 남이 끊기고 빠질 때 브라우저 시험 (PC) — 봇이 끊기면 카드에 "연결 끊김" 배지, 다시 붙으면 사라짐, 60초(손잡이) 탈락이면 카드 사망·직업 안 보임·판 계속, 탈락으로 승부가 나면 결과 화면
// 목록 A09-끊김-나가기-탈주.md 번호 A09-E-053·055·059·061·062·063·065·106·109 (PC 줄) — 60초는 손잡이로 끝냄
const { test, expect, ui } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { customRoleSettings } = require('../../helpers/game');
const { waitResult, resultRow } = require('../room/roomHelpers');
const night = require('./b-night/_night');
const L = require('./a-day/_lib');
const c = require('./c-chat/_lib');
const K = require('./_a09-simple-kit');

const ROLE_WORDS = Object.values(ui.ROLE_LABELS);
const statusOf = (page, nickname) => K.cardOf(page, nickname);

// 그 카드가 "연결 끊김": 상태 값·카드 이름·배지 그림이 보임 (배지는 글 없는 그림이고 누름이 지나가는 층이라 보임·크기·화면 안만)
async function expectDropped(page, nickname) {
    await expect(statusOf(page, nickname)).toHaveAttribute('data-ingame-player-status', 'disconnected', { timeout: 15_000 });
    await expect(L.card(page, nickname)).toHaveAccessibleName(`연결 끊김 ${nickname}`);
    await expectReadable(K.badgeOf(page, nickname), { contrast: false, uncovered: false });
}

// 봇 끊기 → 60초 손잡이 → 판에서 빠질 때까지
async function dropAndExpire(t, bot) {
    const since = Date.now();
    K.dropBot(bot);
    await K.droppedAt(t, K.U(bot), since);
    await K.expire(t, K.U(bot));
}

test('A09-E-053 PC 6명 판, 봇이 끊기면 그 카드에 "연결 끊김" 배지 @game @smoke', async ({ user, table }) => {
    const page = user.page;
    const t = await K.seat(table, user, { n: 6 });
    const bot = K.botOf(t, await t.state(), 'CITIZEN');
    await K.toDay(t);
    await K.clear(page);
    await expect(statusOf(page, bot.nickname)).toHaveAttribute('data-ingame-player-status', 'alive');
    K.dropBot(bot);
    await expectDropped(page, bot.nickname);
    // 끊겼을 뿐 죽은 건 아님
    expect((await t.player(K.U(bot))).alive).toBe(true);
});

test('A09-E-055 PC 8명 판, 끊긴 봇이 다시 붙으면 배지가 사라짐 @game', async ({ user, table }) => {
    const page = user.page;
    const t = await K.seat(table, user, { n: 8 });
    const bot = K.botOf(t, await t.state(), 'CITIZEN');
    await K.toDay(t);
    await K.clear(page);
    K.dropBot(bot);
    await expectDropped(page, bot.nickname);
    await K.returnBot(t, bot);
    await expect(statusOf(page, bot.nickname)).toHaveAttribute('data-ingame-player-status', 'alive', { timeout: 15_000 });
    await expect(K.badgeOf(page, bot.nickname)).toHaveCount(0);
    await expect(L.card(page, bot.nickname)).toHaveAccessibleName(bot.nickname);
});

test('A09-E-059 PC 7명 판, 봇 60초(손잡이) 탈락 → 카드 사망, 직업은 안 보임 @game', async ({ user, table }) => {
    const page = user.page;
    // 화면 소켓이 받는 알림을 엿봄 (판에 들어갈 때 새로 열리는 소켓부터)
    const frames = c.watchSocket(page);
    const t = await K.seat(table, user, { n: 7, settings: customRoleSettings({ JOKER: 1, DOCTOR: 1 }) });
    const doctor = K.botOf(t, await t.state(), 'DOCTOR');
    await K.toDay(t);
    await K.clear(page);
    await dropAndExpire(t, doctor);
    await expect(statusOf(page, doctor.nickname)).toHaveAttribute('data-ingame-player-status', 'dead', { timeout: 15_000 });
    await expect(L.card(page, doctor.nickname)).toHaveAccessibleName(`사망 ${doctor.nickname}`);
    await expectReadable(K.badgeOf(page, doctor.nickname), { contrast: false, uncovered: false });
    // 카드에 직업 글 없음
    const cardText = await statusOf(page, doctor.nickname).innerText();
    for (const word of ROLE_WORDS) expect(cardText, `카드 글에 "${word}"`).not.toContain(word);
    // 화면이 받은 탈락 알림에도 그 사람 직업이 없음 (의사는 이 판에 그 봇 하나)
    await expect.poll(() => frames.some((f) => f.event === 'player_eliminated' && f.payload?.victimUuid === K.U(doctor)), { timeout: 10_000 }).toBe(true);
    const eliminated = frames.filter((f) => f.event === 'player_eliminated');
    expect(JSON.stringify(eliminated)).not.toContain('DOCTOR');
    expect((await t.state()).phase, '승부가 안 났으니 판 계속').not.toBe('ENDED');
});

test('A09-E-061 PC 10명 판, 봇 60초(손잡이) 탈락 뒤에도 판이 다음 단계로 계속 @game', async ({ user, table }) => {
    const page = user.page;
    const t = await K.seat(table, user, { n: 10 });
    const bot = K.botOf(t, await t.state(), 'CITIZEN');
    await K.toDay(t);
    await K.clear(page);
    await dropAndExpire(t, bot);
    await expect(statusOf(page, bot.nickname)).toHaveAttribute('data-ingame-player-status', 'dead', { timeout: 15_000 });
    // 토론 → 투표 → 밤으로 이어짐
    const vote = await K.toVote(t);
    expect(vote.players.filter((p) => p.alive)).toHaveLength(9);
    await K.clear(page);
    await expectReadable(page.getByRole('button', { name: '기권' }));
    const s = await K.toNight(t, 1);
    expect(s.phase).toBe('NIGHT');
    await L.closeNotice(page, '밤이 되었습니다');
});

test('A09-E-062 PC 6명 판, 탈락한 봇 직업은 판이 끝난 결과 화면에서야 보임 @game', async ({ user, table }) => {
    test.setTimeout(180_000);
    const page = user.page;
    const t = await K.seat(table, user, { n: 6, settings: customRoleSettings({ JOKER: 1, GUARD: 1 }) });
    const guard = K.botOf(t, await t.state(), 'GUARD');
    await K.toDay(t);
    await K.clear(page);
    await dropAndExpire(t, guard);
    await expect(statusOf(page, guard.nickname)).toHaveAttribute('data-ingame-player-status', 'dead', { timeout: 15_000 });
    // 판 중엔 그 카드에 직업 글 없음
    expect(await statusOf(page, guard.nickname).innerText()).not.toContain(ui.ROLE_LABELS.GUARD);
    // 남은 봇 표로 광대 처형 → 시민 승 → 결과 화면
    await K.toCitizenWin(t, page);
    const row = resultRow(page, guard.nickname);
    await expect(row).toContainText(ui.ROLE_LABELS.GUARD);
    await expectReadable(row.getByText(ui.ROLE_LABELS.GUARD, { exact: true }));
});

test('A09-E-063 PC 5명 판, 광대 봇 60초(손잡이) 탈락 → 시민 승 결과 화면 @game', async ({ user, table }) => {
    const page = user.page;
    const t = await K.seat(table, user, { n: 5 });
    const joker = K.botOf(t, await t.state(), 'JOKER');
    await K.toDay(t);
    await K.clear(page);
    await dropAndExpire(t, joker);
    await waitResult(page);
    await expectReadable(page.getByText('시민 진영 승리', { exact: true }));
    // 나는 시민이라 승리
    await expect(page.getByText(/^(승리|패배)$/)).toHaveText('승리');
});

test('A09-E-065 PC 6명 판(광대 2), 시민 봇 60초(손잡이) 탈락으로 2:2 → 광대 승 결과 화면 @game', async ({ user, table }) => {
    test.setTimeout(180_000);
    const page = user.page;
    const t = await K.seat(table, user, { n: 6, settings: { jokerCount: 2 } });
    const s0 = await t.state();
    expect(K.botsOf(t, s0, 'JOKER'), '광대 봇 2명').toHaveLength(2);
    const [first, second] = K.botsOf(t, s0, 'CITIZEN');
    // 시민 봇 하나를 처형 → 광대 2 : 나머지 3 (아직 판 계속)
    const afterExecution = await K.execute(t, K.U(first));
    expect(afterExecution.phase).not.toBe('ENDED');
    await K.pastExpulsion(page);
    // 남은 시민 봇이 끊겨 탈락 → 2:2
    await dropAndExpire(t, second);
    await waitResult(page);
    await expectReadable(page.getByText('광대 진영 승리', { exact: true }));
    await expect(page.getByText(/^(승리|패배)$/)).toHaveText('패배');
});

test('A09-E-106 PC 8명 판, 보호를 고른 의사 봇이 60초(손잡이) 탈락해도 보호는 남아 지목된 사람이 삶 (결정 2026-11-16 아침 3) @game', async ({ user, table }) => {
    test.setTimeout(180_000);
    const page = user.page;
    const t = await K.seat(table, user, { n: 8, settings: customRoleSettings({ JOKER: 1, DOCTOR: 1, GUARD: 1 }) });
    const s0 = await t.state();
    const joker = K.botOf(t, s0, 'JOKER');
    const doctor = K.botOf(t, s0, 'DOCTOR');
    const target = K.botOf(t, s0, 'CITIZEN');
    await night.recordUi(page);

    // 1일 밤: 광대가 시민 봇을 지목 → 의사가 같은 사람 보호
    await night.toTurn(t, 'JOKER', { dayIndex: 1 });
    expect((await night.botNight(t, joker, K.U(target)))?.ok, '광대 지목을 서버가 받음').toBe(true);
    await night.toTurn(t, 'DOCTOR', { dayIndex: 1 });
    expect((await night.botNight(t, doctor, K.U(target)))?.ok, '의사 보호를 서버가 받음').toBe(true);
    // 의사 차례가 끝난 뒤(경비원 차례) 의사 봇이 끊겨 그 밤 안에 탈락
    await night.toTurn(t, 'GUARD', { dayIndex: 1 });
    await dropAndExpire(t, doctor);
    await night.waitDead(t, K.U(doctor));

    // 2일 낮: 지목된 사람은 살아 있음, 밤 사이 의사 봇이 빠진 게 보였으니 "아무 일도" 글 창 없이 낮 안내 (사용자 결정 2026-11-18)
    const s = await night.toDay(t, { dayIndex: 2 });
    expect(K.rowOf(s, K.U(target)).alive, '보호받은 사람').toBe(true);
    await expect(page.locator('[data-ingame-phase-entrance="DAY"]')).toBeAttached({ timeout: 20_000 });
    await expect(page.locator('[data-ingame-dawn-report]')).toHaveCount(0);
    const rec = await night.readUi(page);
    expect(rec.dawnMessages.join(' '), '살해 글이 안 나옴').not.toContain('살해당했습니다');
    await expect(statusOf(page, target.nickname)).toHaveAttribute('data-ingame-player-status', 'alive');
});

test('A09-E-109 PC 10명 판, 봇 3명이 끊기면 배지마다 보임 @game', async ({ user, table }) => {
    const page = user.page;
    const t = await K.seat(table, user, { n: 10 });
    const dropped = K.botsOf(t, await t.state(), 'CITIZEN').slice(0, 3);
    expect(dropped).toHaveLength(3);
    await K.toDay(t);
    await K.clear(page);
    for (const bot of dropped) K.dropBot(bot);
    for (const bot of dropped) await expectDropped(page, bot.nickname);
    // 안 끊긴 사람 카드엔 배지 없음
    await expect(page.locator('[data-ingame-player-status="disconnected"]')).toHaveCount(3);
});
