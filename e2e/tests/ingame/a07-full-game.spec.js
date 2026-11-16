'use strict';

// 사람 여럿이 한 판을 처음부터 끝까지 하는 브라우저 시험 (PC, 어려움) — 화면으로 낮 투표·재판·밤 암살을 해서 판을 끝내고 결과판의 승자·승패 띠·직업·골드를 사람마다 봄
// 목록 A07-승패-결과-골드.md 번호 A07-H-001~004 (단계 넘기기 손잡이는 토론·밤 차례 기다림에만), 돌리지 않고 모임만: npx playwright test --list tests/ingame/a07-full-game.spec.js
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { customRoleSettings } = require('../../helpers/game');
const ui = require('../../helpers/ui');
const { hostGame, resultRow, closeReveals } = require('../room/roomHelpers');
const { wallet } = require('../store/store-tools');
const N = require('./b-night/_night');

// ── 이 파일 도우미 (공용으로 올릴 후보: A07 승패·결과 묶음) ──

const U = (x) => x.account.uuid;
const nick = (x) => x.account.nickname;
const resultBoard = (page) => page.getByRole('region', { name: '가면무도회 참가자 정체' });
const goldChip = (page) => page.getByTestId('game-result-gold-reward');
const myChip = (who) => resultRow(who.page, nick(who)).getByTestId('game-result-gold-reward');

// 결과판 직업 글 (판 화면과 같은 이름: 시민 직업은 "귀족" — 결정 2026-11-16 셋째 8번)
const RESULT_JOB = Object.freeze({ JOKER: '광대', CITIZEN: '귀족' });

// 봇 방장 판은 단계 시간을 가장 길게 둠 — 단계는 손잡이·"다 내면 5초"로만 넘어감 (화면을 누르거나 기다리는 동안 진짜 마감이 먼저 오면 흐름이 엇갈림)
const PACE = Object.freeze({ dayDiscussionTime: 150, dayVoteTime: 90, tribunalTime: 120, nightActionTime: 120 });

async function openHumans(players, n) {
    const out = [];
    for (let i = 0; i < n; i += 1) out.push(await players.add());
    return out;
}

// 서버가 정한 직업이 바라는 대로인지 (예약이 가끔 못 맞음 → 판이 다른 쪽으로 끝나는 것 막기)
function expectRoles(s, wanted) {
    for (const [uuid, role] of Object.entries(wanted)) {
        expect(s.players.find((p) => p.uuid === uuid)?.role, `미리 정한 직업 (${uuid})`).toBe(role);
    }
}

// 판 요약이 조건에 맞을 때까지 (단계는 안 넘김)
async function waitState(t, match, message, timeout = 20_000) {
    let last = null;
    await expect.poll(async () => { last = await t.state(); return last ? match(last) : false; }, { timeout, message }).toBe(true);
    return last;
}

// 봇 요청 하나 보내고 서버가 받았는지 확인
async function botDo(bot, event, payload, what) {
    const reply = await bot.request(event, payload);
    expect(reply?.ok, `${what} 거절: ${reply?.code ?? '답 없음'}`).toBe(true);
    return reply;
}

// 역할 창을 닫고 1일 낮 투표까지 (토론은 손잡이로 넘김) — 남은 안내 창은 표를 낼 때 닫음
async function toFirstVote(t) {
    await closeReveals(t.humans.map((h) => h.page));
    await t.advanceUntil('DAY_VOTE');
    for (const h of t.humans) await expect(h.page.getByRole('button', { name: '기권' })).toBeVisible({ timeout: 15_000 });
}

// 사람이 화면으로 낮 표: 그 사람 카드 메뉴 "투표하기" → 기권 단추가 꺼지면 서버가 받은 것 (막는 안내 창은 카드 메뉴 열기가 닫음)
async function voteUi(page, nickname) {
    const menu = await N.openCardMenu(page, nickname);
    await menu.getByRole('menuitem', { name: '투표하기' }).click();
    await expect(menu).toBeHidden();
    await expect(page.getByRole('button', { name: '기권' })).toBeDisabled();
}

// 사람이 화면으로 기권: 기권 단추 → 꺼지면 서버가 받은 것
async function abstainUi(page) {
    const button = page.getByRole('button', { name: '기권' });
    await expect(async () => {
        await N.closeRoleReveal(page);
        await N.closeNotices(page);
        await button.click({ timeout: 1500 });
    }).toPass({ timeout: 20_000 });
    await expect(button).toBeDisabled();
}

// 사람이 화면으로 재판 유죄: 재판 창 "유죄" → 단추가 사라지면 서버가 받은 것
async function guiltyUi(page) {
    const guilty = page.locator('[data-ingame-tribunal-presentation]').getByRole('button', { name: '유죄', exact: true });
    await expect(async () => {
        await ui.closeOverlays(page, { keepWatching: false, rounds: 1, names: ['단계 전환 안내', '알림'], clickTimeoutMs: 1000 });
        await guilty.click({ timeout: 1500 });
    }).toPass({ timeout: 25_000 });
    await expect(guilty).toHaveCount(0);
}

// 영상 연출 셋 (암살 영상·추방 연출·결과 영상) — "건너뛰기"는 이 안에서만 찾음 (밤 차례의 "건너뛰기" 단추와 안 섞이게)
const VIDEO_COVERS = '[data-ingame-night-success-kill], [data-ingame-tribunal-expulsion], [data-game-result-intro]';

// 화면을 막는 연출 넘기기: 영상이 못 돌 때 뜨는 "건너뛰기", 낮 시작 연출 글 창 "확인"
async function passCovers(page) {
    const skip = page.locator(VIDEO_COVERS).getByRole('button', { name: '건너뛰기' }).first();
    if (await skip.isVisible().catch(() => false)) await skip.click({ timeout: 1000 }).catch(() => {});
    const dawnOk = page.locator('[data-ingame-dawn-report]').getByRole('button', { name: '확인' });
    if (await dawnOk.count() > 0) await dawnOk.first().click({ timeout: 1000 }).catch(() => {});
}

// 결과판이 보일 때까지: 가는 길을 막는 연출만 넘김
async function toResult(page, { timeout = 60_000 } = {}) {
    const list = resultBoard(page);
    await expect(async () => {
        await passCovers(page);
        await expect(list).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout });
    await expect(page).toHaveURL(/\/gameresult/);
    return list;
}

// 지갑 골드 (DB) · 그 값이 될 때까지 (판 골드는 판 끝 저장 뒤에 들어옴)
const goldOf = async (uuid) => (await wallet(uuid)).gold;
async function expectGold(uuid, amount) {
    await expect.poll(() => goldOf(uuid), { timeout: 30_000, message: '지갑 골드' }).toBe(amount);
}

// ── 사람만 5명 ──

test('A07-H-001 사람 5명 판 처음부터 끝까지 시민 승 — 화면으로 낮 투표·재판 유죄 → 다섯 화면 "시민 진영 승리", 이긴 편 "승리"·진 편 "패배", 전원 "+1골드"·지갑 +1 @game @hard', async ({ players }) => {
    test.setTimeout(420_000);
    const people = await openHumans(players, 5);
    const [joker, ...citizens] = people;
    const before = await Promise.all(people.map((h) => goldOf(U(h))));
    const roles = Object.fromEntries(people.map((h) => [U(h), h === joker ? 'JOKER' : 'CITIZEN']));
    const t = await hostGame({ host: joker, guests: citizens, roles, settings: { jokers: 1 } });
    expectRoles(await t.state(), roles);

    // 1일 낮: 시민 넷이 광대를 찍고 광대는 기권 → 다섯 다 내서 5초 뒤 재판
    await toFirstVote(t);
    for (const h of citizens) await voteUi(h.page, nick(joker));
    await abstainUi(joker.page);
    await waitState(t, (g) => g.phase === 'TRIBUNAL' && g.tribunal?.defendantUuid === U(joker), '다 낸 뒤 재판', 30_000);

    // 재판: 시민 넷 유죄 (피고는 못 냄) → 다 내서 5초 뒤 처형 → 산 광대 0
    for (const h of citizens) await guiltyUi(h.page);
    const end = await waitState(t, (g) => g.phase === 'ENDED', '처형으로 판 끝', 30_000);
    expect(end.winResult?.winner, '서버 승자').toBe('CITIZEN');

    for (const h of people) {
        const list = await toResult(h.page);
        await expectReadable(list.getByText('시민 진영 승리', { exact: true }));
        await expectReadable(h.page.getByText(h === joker ? '패배' : '승리', { exact: true }), { large: true });
        await expect(myChip(h)).toHaveText('+1골드');
    }
    for (const [i, h] of people.entries()) await expectGold(U(h), before[i] + 1);
});

test('A07-H-002 사람 5명 판(광대 2) 처음부터 끝까지 광대 승 — 1일 밤 광대 둘이 화면으로 같은 시민 암살 → 다섯 화면 "광대 진영 승리", 전원 "+1골드" @game @hard @smoke', async ({ players }) => {
    test.setTimeout(420_000);
    const people = await openHumans(players, 5);
    const [j1, j2, victim] = people;
    const roles = Object.fromEntries(people.map((h, i) => [U(h), i < 2 ? 'JOKER' : 'CITIZEN']));
    const t = await hostGame({ host: j1, guests: people.slice(1), roles, settings: { jokers: 2 } });
    expectRoles(await t.state(), roles);

    // 1일 낮은 아무도 안 찍어 재판 없이 밤 → 광대 차례에 둘이 같은 시민을 고름 → 광대 2 : 나머지 2
    await N.toTurn(t, 'JOKER', { dayIndex: 1 });
    for (const j of [j1, j2]) await N.nightActUi(j.page, nick(victim), '암살');
    const end = await N.toEnd(t);
    expect(end?.winResult?.winner, '서버 승자').toBe('JOKER');

    for (const [i, h] of people.entries()) {
        const list = await toResult(h.page);
        await expectReadable(list.getByText('광대 진영 승리', { exact: true }));
        await expectReadable(h.page.getByText(i < 2 ? '승리' : '패배', { exact: true }), { large: true });
        // 죽은 시민도 판 끝까지 있었으니 받음
        await expect(myChip(h)).toHaveText('+1골드');
    }
});

// ── 사람 + 봇 ──

test('A07-H-003 사람 3 + 봇 3 = 6명 판 처음부터 끝까지 → 사람 셋 결과판에 같은 직업 공개, 골드 칸은 각자 자기 줄에만 @game @hard', async ({ players, table }) => {
    test.setTimeout(360_000);
    const people = await openHumans(players, 3);
    const t = await table.setup({
        humans: people,
        bots: 3,
        settings: customRoleSettings({ JOKER: 1 }, PACE),
        roles: ({ bots }) => ({ [U(bots[0])]: 'JOKER', ...Object.fromEntries(people.map((h) => [U(h), 'CITIZEN'])) }),
    });
    const [jokerBot, ...citizenBots] = t.bots;
    expectRoles(await t.state(), { [U(jokerBot)]: 'JOKER', ...Object.fromEntries(people.map((h) => [U(h), 'CITIZEN'])) });

    // 1일 낮: 사람 셋은 화면으로, 시민 봇 둘은 소켓으로 광대 봇을 찍고 광대 봇은 기권 → 여섯 다 내서 5초 뒤 재판
    await toFirstVote(t);
    for (const h of people) await voteUi(h.page, nick(jokerBot));
    for (const bot of citizenBots) await botDo(bot, 'cast_day_vote', { gameId: t.gameId, targetId: U(jokerBot) }, '봇 낮 표');
    await botDo(jokerBot, 'cast_day_vote', { gameId: t.gameId, targetId: null }, '봇 기권');
    const tribunal = await waitState(t, (g) => g.phase === 'TRIBUNAL' && g.tribunal?.defendantUuid === U(jokerBot), '다 낸 뒤 재판', 30_000);

    // 재판: 사람 셋·시민 봇 둘 유죄 → 처형 → 시민 승
    for (const h of people) await guiltyUi(h.page);
    for (const bot of citizenBots) {
        await botDo(bot, 'cast_tribunal_vote', { gameId: t.gameId, dayIndex: tribunal.dayIndex, vote: 'GUILTY' }, '봇 재판 표');
    }
    const end = await waitState(t, (g) => g.phase === 'ENDED', '처형으로 판 끝', 30_000);
    expect(end.winResult?.winner, '서버 승자').toBe('CITIZEN');

    for (const h of people) {
        const list = await toResult(h.page);
        await expect(list.getByRole('listitem')).toHaveCount(6);
        // 세 화면 모두 여섯 사람의 직업이 서버 값 그대로
        for (const p of end.players) {
            await expect(resultRow(h.page, p.nickname).getByText(RESULT_JOB[p.role], { exact: true }), `${p.nickname} 직업`).toHaveCount(1);
        }
        await expect(goldChip(h.page)).toHaveCount(1);
        await expect(myChip(h)).toHaveText('+1골드');
    }
});

test('A07-H-004 사람 5 + 봇 5 = 10명 판 처음부터 끝까지 → 사람 다섯 화면 결과판 10줄, "MVP" 없음, 마녀사냥꾼 줄 "마녀사냥꾼"("시민"·"귀족" 아님) @game @hard', async ({ players, table }) => {
    test.setTimeout(480_000);
    const people = await openHumans(players, 5);
    const humanRoles = Object.fromEntries(people.map((h) => [U(h), 'CITIZEN']));
    const t = await table.setup({
        humans: people,
        bots: 5,
        settings: PACE,
        roles: ({ bots }) => ({ [U(bots[0])]: 'JOKER', [U(bots[1])]: 'WITCH_HUNTER', ...humanRoles }),
    });
    const [jokerBot, hunterBot] = t.bots;
    const otherBots = t.bots.slice(1);
    expectRoles(await t.state(), { [U(jokerBot)]: 'JOKER', [U(hunterBot)]: 'WITCH_HUNTER', ...humanRoles });

    // 1일 낮: 사람 다섯은 화면으로, 봇 넷은 소켓으로 광대 봇을 찍고 광대 봇은 기권 → 열 명 다 내서 5초 뒤 재판
    await toFirstVote(t);
    for (const h of people) await voteUi(h.page, nick(jokerBot));
    for (const bot of otherBots) await botDo(bot, 'cast_day_vote', { gameId: t.gameId, targetId: U(jokerBot) }, '봇 낮 표');
    await botDo(jokerBot, 'cast_day_vote', { gameId: t.gameId, targetId: null }, '봇 기권');
    const tribunal = await waitState(t, (g) => g.phase === 'TRIBUNAL' && g.tribunal?.defendantUuid === U(jokerBot), '다 낸 뒤 재판', 30_000);

    // 재판: 사람 다섯·봇 넷 유죄 → 처형 → 시민 승
    for (const h of people) await guiltyUi(h.page);
    for (const bot of otherBots) {
        await botDo(bot, 'cast_tribunal_vote', { gameId: t.gameId, dayIndex: tribunal.dayIndex, vote: 'GUILTY' }, '봇 재판 표');
    }
    const end = await waitState(t, (g) => g.phase === 'ENDED', '처형으로 판 끝', 30_000);
    expect(end.winResult?.winner, '서버 승자').toBe('CITIZEN');

    for (const h of people) {
        const list = await toResult(h.page);
        await expect(list.getByRole('listitem')).toHaveCount(10);
        await expect(h.page.getByText(/MVP/i)).toHaveCount(0);
        const hunterRow = resultRow(h.page, nick(hunterBot));
        await expectReadable(hunterRow.getByText('마녀사냥꾼', { exact: true }));
        // 시민 이름으로 잘못 나오면 안 됨 (시민 직업 글은 "귀족", 예전 글은 "시민" — 둘 다 없어야 함)
        await expect(hunterRow.getByText('시민', { exact: true })).toHaveCount(0);
        await expect(hunterRow.getByText('귀족', { exact: true })).toHaveCount(0);
    }
});
