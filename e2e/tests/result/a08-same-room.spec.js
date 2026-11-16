'use strict';

// 판 끝 뒤 "대기방으로" 브라우저 시험 (PC) — 같은 방 코드·같은 설정(공개/코드·정원·광대 수·구성·시간)·준비 안 됨으로 들어감, 판이 어떻게 끝나도 같은 코드
// 목록 A08-판끝-같은방.md 번호 A08-E-007~011·051~059·071 (설정 창은 방장만 열 수 있어 설정을 보는 케이스는 사람이 방장인 판)
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { customRoleSettings, Table } = require('../../helpers/game');
const { e2e } = require('../../helpers/internal');
const { readyUi } = require('../../helpers/ui');
const {
    closeReveals, waitResult, hostGame, createRoomUi, waitRoom, botsJoinAndReady, stepperValue, setStepper, selectTab,
} = require('../room/roomHelpers');
const N = require('../ingame/b-night/_night');

const U = (x) => x.account.uuid;
const returnButton = (page) => page.getByRole('button', { name: '대기방으로' });
const lobbyButton = (page) => page.getByRole('button', { name: '로비로', exact: true });
// 대기방 자리 그림 (사람 자리만 — "방장 자리" 칸은 안 셈)
const seats = (page) => page.getByRole('img', { name: /^(준비 완료한 참가자|준비 전 참가자)$/ });
const settingsDialog = (page) => page.getByRole('dialog', { name: '방 설정 변경' });
const codeOnlyBox = (page) => page.getByRole('checkbox', { name: '코드로만 참가', exact: true });
// 대기방 방 정보 줄의 "앉은 수/정원" 숫자 칸 (결정 2026-11-16 오전 2번 — 보이는 글 "10/10", 읽어 주는 글 "앉은 사람 10명, 정원 10명")
const seatCount = (page) => page.getByTestId('matching-party-capacity');
// 대기방 방 정보 줄의 방 이름 칸 (결정 2026-11-16 오전 1번)
const roomTitle = (page) => page.getByTestId('matching-room-title');

// 그림 단추가 읽히는지: 단추 자체는 보임·화면 안·안 가려짐, 대비는 단추 위에 얹은 글 칸에서 잼
// (글자색이 그 글 칸에 걸려 있고, 그 칸은 누르기를 안 받아 가려짐 검사에서는 뺌)
async function expectButtonReadable(button) {
    await expectReadable(button, { contrast: false });
    await expectReadable(button.locator('span[aria-hidden="true"]').last(), { uncovered: false });
}

// 봇 표로 광대 봇을 처형하게 계획을 줌 (사람은 표 안 냄 = 기권, 봇 표가 기권보다 많은지 먼저 봄)
async function planExecution(t, user) {
    // 미리 정한 직업이 가끔 안 맞음 → 서버 값으로 광대 봇을 다시 찾음
    const s = await t.state();
    const jokerUuid = s.players.find((p) => p.role === 'JOKER')?.uuid;
    const joker = t.bots.find((bot) => U(bot) === jokerUuid);
    expect(joker, '광대는 봇이어야 함 (사람은 시민)').toBeTruthy();
    await t.assertBotsCanExecute(jokerUuid);
    t.playBots((bot) => ({ dayVote: bot === joker ? 'abstain' : jokerUuid, tribunal: 'GUILTY', night: 'skip' }));
    await closeReveals([user.page]);
    return joker;
}

/**
 * 봇 방장 판(사람 1 + 봇 total-1) → 광대 봇 처형으로 시민 승 → 결과 화면
 * @returns {Promise<{ t:any, host:any, joker:any, end:any }>} host = 방장 봇
 */
async function playBotHosted({ user, table, total }) {
    const t = await table.setup({
        humans: [user],
        bots: total - 1,
        roles: ({ humans, bots }) => ({ [U(humans[0])]: 'CITIZEN', [U(bots.at(-1))]: 'JOKER' }),
    });
    const joker = await planExecution(t, user);
    const end = await N.toEnd(t);
    await waitResult(user.page);
    return { t, host: t.bots[0], joker, end };
}

/**
 * 사람이 방장인 판(화면으로 방 만듦, 사람 1 + 봇 total-1) → 광대 봇 처형으로 시민 승 → 결과 화면
 * @param {object} o.settings 설정 화면 칸 (roomHelpers fillSettings: code·maxPlayers·jokers·discussion·vote·tribunal·night)
 */
async function playHumanHosted({ user, bots, total, settings = {} }) {
    const botList = await bots.spawn(total - 1);
    const t = await hostGame({
        host: user, botList, settings,
        roles: { [U(user)]: 'CITIZEN', [U(botList.at(-1))]: 'JOKER' },
    });
    await planExecution(t, user);
    await N.toEnd(t);
    await waitResult(user.page);
    return t;
}

// 결과 화면 "대기방으로" → 대기방 화면
async function backToRoom(page) {
    await returnButton(page).click();
    await expect(page).toHaveURL(/\/game-matching/, { timeout: 20_000 });
}

// 대기방 "초대코드 공유" 창에 적힌 방 코드 (6칸 값을 이어 붙임), 읽고 창 닫음
async function shownRoomCode(page) {
    const open = page.getByRole('button', { name: '초대코드 공유' });
    // 방 확인이 끝나야 눌림
    await expect(open).toBeEnabled({ timeout: 20_000 });
    await open.click();
    const dialog = page.getByRole('dialog', { name: '방코드' });
    const cells = dialog.getByRole('textbox', { name: /방 코드 \d번째 자리/ });
    await expect(cells).toHaveCount(6);
    const code = (await cells.evaluateAll((els) => els.map((el) => el.value))).join('');
    await dialog.getByRole('button', { name: '방코드 팝업 닫기' }).click();
    await expect(dialog).toHaveCount(0);
    return code;
}

// 돌아온 대기방에서 "방 설정 변경" 창 열기 (방장에게만 단추가 있음)
async function openRoomSettings(page) {
    await page.getByRole('button', { name: '방 설정 변경' }).click();
    await expect(settingsDialog(page)).toBeVisible();
}

// 설정 창 숫자 칸 값, 예: '60초' → 60
const numberOf = async (page, label) => parseInt(await stepperValue(page, label), 10);

// 설정 창 "회의&투표" 탭의 시간 4칸
async function shownTimes(page) {
    await selectTab(page, '회의&투표');
    return {
        discussion: await numberOf(page, '낮 토론 시간 조절'),
        vote: await numberOf(page, '낮 투표 시간 조절'),
        tribunal: await numberOf(page, '재판 시간 조절'),
        night: await numberOf(page, '밤 행동 시간 조절'),
    };
}

test('A08-E-007 5명 판 끝 → "대기방으로" → 대기방 화면, 화면 방 코드 = 판 전 방 코드 @game @smoke', async ({ user, table }) => {
    const { t } = await playBotHosted({ user, table, total: 5 });
    const page = user.page;

    await backToRoom(page);
    expect(await shownRoomCode(page)).toBe(t.roomCode);
    // 서버도 같은 코드 방에 앉힘
    const room = await waitRoom(U(user));
    expect(room.roomCode).toBe(t.roomCode);
});

test('A08-E-008 7명 판(코드 방·정원 7·광대 2 직접 구성·시간 바꿈) 끝 → 돌아온 대기방 설정 창 값이 다 같음 @game', async ({ user, bots }) => {
    test.setTimeout(180_000);
    const page = user.page;
    const botList = await bots.spawn(6);
    const jokers = botList.slice(-2);
    // 투표·밤 시간은 서버가 받는 값(30·60·90 / 30·60·90·120) 안에서 고름 — 목록의 투표 45·밤 40은 못 넣는 값
    const t = await hostGame({
        host: user,
        botList,
        settings: { code: true, maxPlayers: 7, custom: { JOKER: 2, DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0 }, discussion: 60, vote: 30, tribunal: 30, night: 60 },
        roles: { [U(user)]: 'CITIZEN', [U(jokers[0])]: 'JOKER', [U(jokers[1])]: 'JOKER' },
    });
    const s = await t.state();
    const realJokers = t.bots.filter((bot) => s.players.find((p) => p.uuid === U(bot))?.role === 'JOKER');
    expect(realJokers, '광대 둘 다 봇이어야 함').toHaveLength(2);

    // 광대 봇 둘이 나감 → 산 광대 0 → 시민 승으로 판 끝
    await closeReveals([page]);
    await t.advanceUntil('DAY');
    for (const joker of realJokers) {
        const left = await joker.request('leave_game_session', { gameId: t.gameId });
        expect(left?.ok, `광대 봇 나가기 답 ${JSON.stringify(left)}`).toBe(true);
    }
    await waitResult(page);
    await backToRoom(page);

    await openRoomSettings(page);
    await selectTab(page, '일반');
    await expect(codeOnlyBox(page)).toHaveAttribute('aria-checked', 'true');
    expect(await numberOf(page, '최대 플레이어 수')).toBe(7);
    expect(await stepperValue(page, '역할 구성')).toBe('직접 지정');
    expect(await numberOf(page, '광대 인원')).toBe(2);
    expect(await shownTimes(page)).toEqual({ discussion: 60, vote: 30, tribunal: 30, night: 60 });
});

test('A08-E-009 6명 코드 방 판 끝 → 돌아온 대기방 설정 창 "코드로만 참가" 켜짐 그대로 @game', async ({ user, bots }) => {
    const page = user.page;
    await playHumanHosted({ user, bots, total: 6, settings: { code: true } });
    await backToRoom(page);

    await openRoomSettings(page);
    await selectTab(page, '일반');
    await expect(codeOnlyBox(page)).toHaveAttribute('aria-checked', 'true');
});

test('A08-E-010 8명 공개 방 판 끝 → 돌아온 대기방 설정 창 "코드로만 참가" 꺼짐 그대로 @game', async ({ user, bots }) => {
    const page = user.page;
    await playHumanHosted({ user, bots, total: 8, settings: { code: false } });
    await backToRoom(page);

    await openRoomSettings(page);
    await selectTab(page, '일반');
    await expect(codeOnlyBox(page)).toHaveAttribute('aria-checked', 'false');
});

test('A08-E-011 5명 판 끝 → 대기방에 준비 안 됨으로 들어감: 내 자리 준비 전 표시, "준비완료" 단추 읽힘 @game', async ({ user, table }) => {
    await playBotHosted({ user, table, total: 5 });
    const page = user.page;
    await backToRoom(page);

    // 아직 나 혼자 → 사람 자리 1칸, 준비 전 그림
    await expect(seats(page)).toHaveCount(1);
    await expect(page.getByRole('img', { name: '준비 전 참가자' })).toHaveCount(1);
    await expect(page.getByRole('img', { name: '준비 완료한 참가자' })).toHaveCount(0);
    // 준비 안 된 사람에게는 "준비완료"(누르면 준비) 단추, 준비한 사람이면 "준비취소"
    await expectButtonReadable(page.getByRole('button', { name: '준비완료' }));
    await expect(page.getByRole('button', { name: '준비취소' })).toHaveCount(0);
    const room = await waitRoom(U(user));
    expect(room.players.find((p) => p.uuid === U(user))?.isReady).toBe(false);
});

test('A08-E-051 5명 판 끝 → 돌아온 대기방 이름 = 판 전 방 이름("방장 닉네임의 방") @game', async ({ user, table }) => {
    const { host } = await playBotHosted({ user, table, total: 5 });
    const page = user.page;
    await backToRoom(page);

    // 방 이름은 만든 사람(방장 봇) 닉네임의 방 — 대기방 창 안 방 정보 줄에 보임 (결정 2026-11-16 오전 1번·낮 셋째 4번)
    await expect(roomTitle(page)).toHaveText(`${host.nickname}의 방`);
    await expectReadable(roomTitle(page));
});

test('A08-E-052 8명 판: 대기방에서 밤 60초로 바꾸고 판 → 판 끝 → 돌아온 대기방 설정 밤 60초 @game', async ({ user, bots }) => {
    test.setTimeout(180_000);
    const page = user.page;
    const botList = await bots.spawn(7);

    // 화면으로 방 만듦(밤 30초) → 대기방에서 밤 60초로 바꿔 저장
    const created = await createRoomUi(user, { jokers: 1, maxPlayers: 8, night: 30 });
    await openRoomSettings(page);
    await selectTab(page, '회의&투표');
    await setStepper(page, '밤 행동 시간 조절', 60);
    await page.getByRole('button', { name: '설정 저장' }).click();
    await expect(settingsDialog(page)).toHaveCount(0);
    await waitRoom(U(user), (room) => room.settings?.nightActionTime === 60);

    // 봇 7 입장·준비 → 사람 준비 → 시작 (8명 판)
    await botsJoinAndReady(botList, U(user), created.roomCode);
    await e2e.setRoles({ [U(user)]: 'CITIZEN', [U(botList.at(-1))]: 'JOKER' });
    await expect(seats(page)).toHaveCount(8);
    await readyUi(page);
    await expect(page.getByRole('button', { name: '준비취소' })).toBeVisible();
    await page.getByRole('button', { name: '게임시작' }).click();
    await expect(page).toHaveURL(/\/ingame/, { timeout: 20_000 });
    const t = new Table({ room: created, bots: botList, humans: [user] });
    t.gameId = (await e2e.gameOf(U(user))).gameId;

    await planExecution(t, user);
    await N.toEnd(t);
    await waitResult(page);
    await backToRoom(page);

    await openRoomSettings(page);
    expect((await shownTimes(page)).night).toBe(60);
});

test('A08-E-053 10명 판 끝 → 사람 + 봇 9 전원 "대기방으로" → 인원 "10/10" @game', async ({ user, table }) => {
    test.setTimeout(180_000);
    const { t, host } = await playBotHosted({ user, table, total: 10 });
    const page = user.page;

    // 원래 방장 봇부터 봇 9 모두 들어감 (처형된 광대 봇도 결과 화면에 있으니 들어감)
    for (const bot of [host, ...t.bots.filter((b) => b !== host)]) {
        const back = await bot.request('return_to_room', { gameId: t.gameId });
        expect(back?.ok, `봇 대기방으로 답 ${JSON.stringify(back)}`).toBe(true);
    }
    await backToRoom(page);

    await expect(seats(page)).toHaveCount(10);
    await expect(seatCount(page).locator('[aria-hidden="true"]')).toHaveText('10/10');
    await expect(seatCount(page)).toContainText('앉은 사람 10명, 정원 10명');
    await expectReadable(seatCount(page));
    const room = await waitRoom(U(user), (r) => r.players.length === 10);
    expect(room.roomCode).toBe(t.roomCode);
});

test('A08-E-054 8명 자동 구성 판 끝 → 돌아온 대기방 설정 "역할 구성"이 "자동" 그대로 @game', async ({ user, bots }) => {
    test.setTimeout(180_000);
    const page = user.page;
    await playHumanHosted({ user, bots, total: 8 });
    await backToRoom(page);

    await openRoomSettings(page);
    await selectTab(page, '일반');
    expect(await stepperValue(page, '역할 구성')).toBe('자동');
});

test('A08-E-055 5명 판(시간 최소값 토론 30·투표 30·재판 15·밤 30) 끝 → 돌아온 대기방 같은 값 @game', async ({ user, bots }) => {
    const page = user.page;
    await playHumanHosted({ user, bots, total: 5, settings: { discussion: 30, vote: 30, tribunal: 15, night: 30 } });
    await backToRoom(page);

    await openRoomSettings(page);
    expect(await shownTimes(page)).toEqual({ discussion: 30, vote: 30, tribunal: 15, night: 30 });
});

test('A08-E-056 6명 판(시간 최대값 토론 150·투표 90·재판 120·밤 120) 끝 → 돌아온 대기방 같은 값 @game', async ({ user, bots }) => {
    const page = user.page;
    await playHumanHosted({ user, bots, total: 6, settings: { discussion: 150, vote: 90, tribunal: 120, night: 120 } });
    await backToRoom(page);

    await openRoomSettings(page);
    expect(await shownTimes(page)).toEqual({ discussion: 150, vote: 90, tribunal: 120, night: 120 });
});

test('A08-E-057 7명 판: 재판에서 광대 처형으로 끝남 → 결과 화면 → "대기방으로" → 같은 코드 @game', async ({ user, table }) => {
    const { t, joker, end } = await playBotHosted({ user, table, total: 7 });
    const page = user.page;

    // 광대 봇이 처형돼 죽었고 시민 승
    expect(end?.players.find((p) => p.uuid === U(joker))?.alive).toBe(false);
    await expectReadable(page.getByText('시민 진영 승리', { exact: true }));

    await backToRoom(page);
    expect(await shownRoomCode(page)).toBe(t.roomCode);
});

test('A08-E-058 5명 판: 광대 봇이 산 채로 나가 시민 승으로 끝남 → 결과 화면 → "대기방으로" → 같은 코드 @game', async ({ user, table }) => {
    const page = user.page;
    const t = await table.setup({
        humans: [user],
        bots: 4,
        roles: ({ humans, bots }) => ({ [U(humans[0])]: 'CITIZEN', [U(bots.at(-1))]: 'JOKER' }),
    });
    const s = await t.state();
    const joker = t.bots.find((bot) => s.players.find((p) => p.uuid === U(bot))?.role === 'JOKER');
    expect(joker, '광대는 봇이어야 함').toBeTruthy();

    await closeReveals([page]);
    await t.advanceUntil('DAY');
    const left = await joker.request('leave_game_session', { gameId: t.gameId });
    expect(left?.ok, `광대 봇 나가기 답 ${JSON.stringify(left)}`).toBe(true);

    await waitResult(page);
    await expectReadable(page.getByText('시민 진영 승리', { exact: true }));
    await backToRoom(page);
    expect(await shownRoomCode(page)).toBe(t.roomCode);
});

test('A08-E-059 6명 판: 밤 암살로 광대 승 → 낮 연출 뒤 결과 화면 → "대기방으로" → 같은 코드 @game', async ({ user, table }) => {
    test.setTimeout(180_000);
    const page = user.page;
    // 광대 2 + 시민 4 (의사 없음 — 살리기가 끼면 판이 안 끝남)
    const t = await table.setup({
        humans: [user],
        bots: 5,
        settings: customRoleSettings({ JOKER: 2 }),
        roles: ({ humans, bots }) => ({ [U(humans[0])]: 'CITIZEN', [U(bots[3])]: 'JOKER', [U(bots[4])]: 'JOKER' }),
    });
    const s = await t.state();
    const roleOf = (bot) => s.players.find((p) => p.uuid === U(bot))?.role;
    expect(t.bots.filter((bot) => roleOf(bot) === 'JOKER'), '광대 둘 다 봇이어야 함').toHaveLength(2);
    const [executed, killed] = t.bots.filter((bot) => roleOf(bot) !== 'JOKER');

    // 1일 낮: 봇 표로 시민 봇 하나 처형(광대 2 : 나머지 3) → 1일 밤: 광대가 시민 봇 하나 암살(2 : 2) → 광대 승
    await t.assertBotsCanExecute(U(executed));
    t.playBots((bot) => ({ dayVote: bot === executed ? 'abstain' : U(executed), tribunal: 'GUILTY', night: U(killed) }));
    await closeReveals([page]);

    // 밤 암살로 끝나면 낮 시작 연출(암살 영상 + 글, 영상을 못 틀면 글 창)을 먼저 보여 줌
    // (글 창을 감싼 칸은 크기가 없어 그 안 글로 찾음)
    const dawn = page.locator('[data-ingame-dawn-report-message], [data-ingame-dawn-report] p').first();
    const dawnShown = dawn.waitFor({ state: 'visible', timeout: 120_000 }).then(() => true, () => false);
    const end = await N.toEnd(t);
    expect(end?.players.find((p) => p.uuid === U(killed))?.alive).toBe(false);
    expect(await dawnShown, '결과 화면 앞에 낮 시작 연출이 보임').toBe(true);

    // 연출이 끝나면 결과 화면 (글 창이면 "확인"을 눌러야 넘어감)
    await expect(async () => {
        await N.closeDawnReport(page);
        await expect(page).toHaveURL(/\/gameresult/, { timeout: 2000 });
    }).toPass({ timeout: 60_000 });
    await waitResult(page);
    await expectReadable(page.getByText('광대 진영 승리', { exact: true }));

    await backToRoom(page);
    expect(await shownRoomCode(page)).toBe(t.roomCode);
});

test('A08-E-071 5명 판 끝 → 결과 영상 뒤 "대기방으로"·"로비로" 단추 둘 다 읽힘 @game', async ({ user, table }) => {
    await playBotHosted({ user, table, total: 5 });
    const page = user.page;

    await expectButtonReadable(returnButton(page));
    await expectButtonReadable(lobbyButton(page));
    await expect(returnButton(page)).toBeEnabled();
    await expect(lobbyButton(page)).toBeEnabled();
});
