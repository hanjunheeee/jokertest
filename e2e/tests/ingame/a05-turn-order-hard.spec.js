'use strict';

// 밤 차례 순서 시험(어려움): 직업 넷 사람 4명 화면의 차례 안내 수, 다 죽은 직업 차례의 무작위 기다림, 마녀사냥꾼 첫 밤 없음, 안 고르고 시간 끝까지
// 목록 시험목록/A05a-밤-차례-능력.md A05-H-013·018·019·024·025 — 쓰는 동안엔 안 돌림: npx playwright test --list tests/ingame/a05-turn-order-hard.spec.js
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const kit = require('../mobile/_a05a-kit');

const { night, uuidOf, nickOf, TURN_ROLES, TURN_MESSAGES } = kit;
// 진짜 시간 허용 폭
const SLACK_MS = 1500;
const noticeText = (page, role) => kit.turnNotice(page, role).getByText(TURN_MESSAGES[role], { exact: true });
const dayMark = (page, dayIndex) => page.locator(`[aria-label="제 ${dayIndex}일 시간 흐름"]`).first();

test('A05-H-013 10명 광대·의사·경비원·마녀사냥꾼 사람 4명: 첫 밤 네 화면 모두 차례 안내 3개, 둘째 밤 4개 @game @hard @smoke', async ({ user, players, table }) => {
    test.setTimeout(300_000);
    const people = [user, await players.add(), await players.add(), await players.add()];
    const g = await kit.seat(table, { humans: people, bots: 6, humanRoles: [...TURN_ROLES], autoConfirm: false });
    const pageOf = Object.fromEntries(TURN_ROLES.map((role, i) => [role, people[i].page]));
    const seenTurns = (page) => night.readUi(page).then((rec) => rec.turns);

    // 밤 한 번 지켜보기: 차례마다 네 화면 기록에 그 안내가 적힌 걸 보고, 안내가 닫힌 뒤 다음 차례로 (아무도 안 고름)
    async function watchNight(expected, before) {
        // 광대 사람 화면은 맨 나중에 확인을 눌러, 뜨자마자 읽히는지 봄
        for (const h of people.slice(1)) await kit.confirmEntrance(h.page, 'NIGHT');
        await kit.confirmEntrance(pageOf.JOKER, 'NIGHT');
        await kit.expectTurnNotice(pageOf.JOKER, 'JOKER');
        const plan = {};
        expected.forEach((role, i) => {
            plan[role] = kit.watch(async () => {
                // 내 직업 차례 안내는 그 사람 화면에서 읽히는지까지
                if (role !== 'JOKER') await kit.expectTurnNotice(pageOf[role], role);
                const soFar = [...before, ...expected.slice(0, i + 1)];
                for (const h of people) await expect.poll(() => seenTurns(h.page), { timeout: 15_000 }).toEqual(soFar);
                await Promise.all(people.map((h) => kit.waitNoticeGone(h.page)));
            });
        });
        const { turns } = await kit.playNight(g.t, plan);
        expect(turns).toEqual(expected);
    }

    const firstNight = ['JOKER', 'DOCTOR', 'GUARD'];
    await kit.toNight(g.t, 1);
    await watchNight(firstNight, []);
    // 첫 밤이 끝난 뒤 네 화면 모두 안내는 3개뿐 (마녀사냥꾼 안내 없음)
    for (const h of people) expect(await seenTurns(h.page)).toEqual(firstNight);

    await kit.toNight(g.t, 2);
    await watchNight([...TURN_ROLES], firstNight);
    for (const h of people) expect(await seenTurns(h.page)).toEqual([...firstNight, ...TURN_ROLES]);
});

test('A05-H-018 6명 의사 사람이 첫날 처형된 판, 사람 3명 화면: 첫 밤 "의사의 시간입니다"가 뜨고 6~18초 뒤 같은 때 낮으로 @game @hard @realtime', async ({ user, players, table }) => {
    test.setTimeout(300_000);
    // 밤 30초 판: 다 죽은 직업 차례는 차례 길이의 20~60%(6~18초)를 무작위로 기다림
    const doctor = user;
    const watchers = [await players.add(), await players.add()];
    const g = await kit.seat(table, {
        humans: [doctor, ...watchers], bots: 3, humanRoles: ['DOCTOR', 'CITIZEN', 'CITIZEN'], botRoles: ['JOKER'],
        // 낮 투표는 사람이 화면으로 내서 넉넉히 90초 (손잡이로 넘김), 밤은 30초
        settings: { nightActionTime: 30, dayVoteTime: 90 }, autoConfirm: false,
    });
    const [joker] = g.bots.JOKER;

    // 첫날: 봇 3표 + 시민 사람 2명이 화면으로 의사 사람에게 투표 (5표 > 기권 1) → 재판에서 봇 3명 유죄 → 처형
    await g.t.advanceUntil((s) => s.phase === 'DAY' && s.dayPhase === 'DAY_VOTE');
    for (const bot of g.t.bots) {
        const r = await bot.request('cast_day_vote', { gameId: g.t.gameId, targetId: uuidOf(doctor) });
        expect(r?.ok, `봇 낮 표 (${r?.code ?? ''})`).toBe(true);
    }
    for (const h of watchers) await kit.voteUi(h.page, nickOf(doctor));
    await g.t.advance();
    await kit.waitState(g.t, (s) => s.phase === 'TRIBUNAL' && s.tribunal?.defendantUuid === uuidOf(doctor), '재판 열림');
    for (const bot of g.t.bots) {
        const r = await bot.request('cast_tribunal_vote', { gameId: g.t.gameId, dayIndex: 1, vote: 'GUILTY' });
        expect(r?.ok, `봇 재판 표 (${r?.code ?? ''})`).toBe(true);
    }
    await g.t.advance();
    await kit.waitState(g.t, (s) => s.players.find((p) => p.uuid === uuidOf(doctor))?.alive === false, '의사 처형됨');

    // 여기부터 손잡이 안 씀: 산 두 사람이 추방 연출 뒤 밤 안내를 확인 (광대 차례 안내가 뜸)
    for (const h of watchers) await kit.confirmEntrance(h.page, 'NIGHT');
    // 광대 봇이 건너뛰면 5초 뒤 광대 차례가 닫히고, 산 사람이 없는 의사 차례가 열림
    await kit.botPick(g.t, joker, null);
    const openedAt = await Promise.all(watchers.map(async (h) => {
        await noticeText(h.page, 'DOCTOR').waitFor({ state: 'visible', timeout: 15_000 });
        return Date.now();
    }));
    await Promise.all(watchers.map((h) => expectReadable(noticeText(h.page, 'DOCTOR'), { timeout: 2500 })));

    // 세 화면(죽은 의사 사람 포함)이 낮으로 넘어간 때
    const dayAt = await Promise.all([doctor, ...watchers].map(async (h) => {
        await dayMark(h.page, 2).waitFor({ state: 'attached', timeout: 25_000 });
        return Date.now();
    }));
    expect(Math.min(...dayAt) - Math.max(...openedAt)).toBeGreaterThanOrEqual(6000 - SLACK_MS);
    expect(Math.max(...dayAt) - Math.min(...openedAt)).toBeLessThanOrEqual(18_000 + SLACK_MS);
    // 같은 때: 세 화면 차이가 허용 폭 안
    expect(Math.max(...dayAt) - Math.min(...dayAt)).toBeLessThanOrEqual(SLACK_MS);
});

test('A05-H-019 10명 마녀사냥꾼·시민 사람 2명: 처형된 사람이 있어도 첫 밤엔 마녀사냥꾼 차례 없음 → 둘째 밤 그 사람 확인 결과 창 @game @hard', async ({ user, players, table }) => {
    test.setTimeout(300_000);
    const hunter = user;
    const citizen = await players.add();
    const g = await kit.seat(table, { humans: [hunter, citizen], bots: 8, humanRoles: ['WITCH_HUNTER', 'CITIZEN'], botRoles: ['JOKER', 'DOCTOR', 'GUARD'] });
    const [executed] = g.bots.CITIZEN;
    await kit.executeByBots(g.t, uuidOf(executed));

    // 첫 밤: 광대·의사·경비원 차례 내내 마녀사냥꾼 화면엔 확인 항목도 건너뛰기 단추도 없음
    const noTurn = kit.watch(async () => {
        expect(await kit.itemState(hunter.page, nickOf(executed), 'WITCH_HUNTER')).toBe('없음');
        await expect(night.skipButton(hunter.page)).toHaveCount(0);
    });
    const first = await kit.playNight(g.t, { JOKER: noTurn, DOCTOR: noTurn, GUARD: noTurn });
    expect(first.turns).toEqual(['JOKER', 'DOCTOR', 'GUARD']);
    for (const h of [hunter, citizen]) {
        await kit.expectDayShown(h.page, 2);
        expect((await night.readUi(h.page)).turns).not.toContain('WITCH_HUNTER');
    }

    // 둘째 밤: 마녀사냥꾼 차례가 열림 → 처형된 사람 확인
    await kit.toNight(g.t, 2);
    const second = await kit.playNight(g.t, { WITCH_HUNTER: () => kit.pickNight(hunter.page, nickOf(executed), 'WITCH_HUNTER') });
    expect(second.turns).toEqual([...TURN_ROLES]);
    await kit.expectRoleResult(hunter.page, nickOf(executed), 'CITIZEN');
    await kit.expectNoResult(citizen.page, 3);
});

test('A05-H-024 6명 광대·시민 사람 2명, 밤 30초: 광대 사람이 안 고르면 30초 뒤 차례가 넘어가고 아무도 안 죽음 @game @hard @realtime', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    const joker = user;
    const citizen = await players.add();
    const g = await kit.seat(table, {
        humans: [joker, citizen], bots: 4, humanRoles: ['JOKER', 'CITIZEN'], botRoles: ['DOCTOR'], settings: { nightActionTime: 30 }, autoConfirm: false,
    });
    const [doctor] = g.bots.DOCTOR;
    // 낮 투표 마감(아무도 안 냄)을 넘기면 밤 → 여기부터 손잡이 안 씀
    await g.t.advanceUntil((s) => s.phase === 'DAY' && s.dayPhase === 'DAY_VOTE');
    await g.t.advance();
    // 밤이 되면 바로 광대 차례가 열림 → 이때부터 잼
    const nightAt = Date.now();
    // 광대 사람 화면을 나중에 확인해, 차례 안내가 뜨자마자 읽히는지 봄
    for (const h of [citizen, joker]) await kit.confirmEntrance(h.page, 'NIGHT');
    await kit.expectTurnNotice(joker.page, 'JOKER');

    // 광대 사람은 아무것도 안 누름 → 광대 차례 30초가 끝나면 의사 차례 안내가 뜸
    await Promise.all([joker, citizen].map((h) => noticeText(h.page, 'DOCTOR').waitFor({ state: 'visible', timeout: 40_000 })));
    const passed = Date.now() - nightAt;
    expect(passed).toBeGreaterThanOrEqual(30_000 - SLACK_MS);
    expect(passed).toBeLessThanOrEqual(30_000 + SLACK_MS);

    // 의사 봇도 건너뜀 → 5초 뒤 낮, 두 화면 다 사망 카드 없음
    await kit.botPick(g.t, doctor, null);
    for (const h of [joker, citizen]) await kit.expectDeadCount(h.page, 2, 0);
});

test('A05-H-025 8명 경비원·시민 사람 2명, 밤 30초: 경비원 사람이 시간 끝까지 안 고르면 결과 창 없음 @game @hard @realtime', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    const guard = user;
    const citizen = await players.add();
    const g = await kit.seat(table, {
        humans: [guard, citizen], bots: 6, humanRoles: ['GUARD', 'CITIZEN'], botRoles: ['JOKER', 'DOCTOR'], settings: { nightActionTime: 30 }, autoConfirm: false,
    });
    const [joker] = g.bots.JOKER;
    const [doctor] = g.bots.DOCTOR;
    await g.t.advanceUntil((s) => s.phase === 'DAY' && s.dayPhase === 'DAY_VOTE');
    await g.t.advance();
    // 여기부터 손잡이 안 씀: 광대·의사 봇은 건너뛰어 5초씩 뒤에 차례가 닫힘
    for (const h of [guard, citizen]) await kit.confirmEntrance(h.page, 'NIGHT');
    await kit.botPick(g.t, joker, null);
    await kit.waitState(g.t, (s) => s.phase === 'NIGHT' && s.nightTurnRole === 'DOCTOR', '의사 차례 열림');
    await kit.botPick(g.t, doctor, null);

    // 경비원 차례: 안내가 뜬 때부터 아무것도 안 누름 → 30초 뒤 낮
    await noticeText(guard.page, 'GUARD').waitFor({ state: 'visible', timeout: 15_000 });
    const openedAt = Date.now();
    await expectReadable(noticeText(guard.page, 'GUARD'), { timeout: 2500 });
    await dayMark(guard.page, 2).waitFor({ state: 'attached', timeout: 40_000 });
    const passed = Date.now() - openedAt;
    expect(passed).toBeGreaterThanOrEqual(30_000 - SLACK_MS);
    expect(passed).toBeLessThanOrEqual(30_000 + SLACK_MS);

    // 조사를 안 했으니 두 화면 다 결과 창 없음
    for (const h of [guard, citizen]) await kit.expectNoResult(h.page, 2);
});
