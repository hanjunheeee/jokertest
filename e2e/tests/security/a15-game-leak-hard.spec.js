'use strict';

// 판 비밀 어려움 브라우저 시험 (PC, 사람 여럿) — 판 처음부터 끝까지 두 사람 화면·받은 값에 남의 직업 없음, 같은 직업끼리만 동료, 조사·확인 결과는 쓴 사람만, 처형된 사람 직업은 판 끝까지 비공개, 판 밖 사람은 아무것도 못 받음
// 목록 A15-보안.md 번호 A15-H-001~006 (쓰는 동안 안 돌림: npx playwright test --list tests/security/a15-game-leak-hard.spec.js)
const { test, expect, ui } = require('../../helpers/fixtures');
const k = require('./_a15-kit');
const pc = require('../ingame/_a05a-pc-kit');
const r = require('../ingame/_a07-simple-kit');

const { n } = k;
const C = (count) => Array(count).fill('CITIZEN');
const uid = (who) => who.account.uuid;
const nick = (who) => who.nickname ?? who.account.nickname;
const TEN = { JOKER: 2, DOCTOR: 2, GUARD: 2, WITCH_HUNTER: 2 };

// 결과판까지 가서 사람마다 직업 글이 보임 (결과판엔 모두 공개 — 05글 "승패 뒤에만 전원 직업")
async function expectBoardJobs(page, people) {
    await r.reachBoard(page);
    await r.expectJobs(page, people);
}

test('A15-H-001 사람 광대 1·사람 시민 1 + 봇 4 (6명) 판 처음부터 끝까지: 두 화면 받은 값·카드 글에 남의 직업 없음, 판 끝 결과판에만 6명 직업 @hard @game @smoke', async ({ user, players, table }) => {
    test.setTimeout(360_000);
    const citizen = await players.add();
    const humans = [user, citizen];
    const frames = humans.map((h) => k.watchFrames(h.page));
    const { t } = await k.setupGame(table, { humans, bots: 4, counts: { JOKER: 1, DOCTOR: 1 }, humanRoles: ['JOKER', 'CITIZEN'], botRoles: ['DOCTOR', ...C(3)] });
    // 1일 봇 시민 처형 → 밤 암살 없음 → 2일 낮
    const mid = await k.playScript(t, { executes: { 1: uid(t.bots[1]) }, until: (s) => s.phase === 'DAY' && s.dayIndex === 2 });
    // 2일 낮 카드: 남의 카드에 직업 글·"동료" 없음 (광대 1명이라 동료도 없음)
    for (const h of humans) {
        const others = [...humans.filter((x) => x !== h), ...t.bots].map(nick);
        await k.expectCardsHideRoles(h.page, others);
    }
    // 2일 사람 광대 처형 → 시민 승으로 판 끝
    const end = await k.playScript(t, { executes: { 2: uid(user) }, until: (s) => s.phase === 'ENDED' });
    expect(end?.phase, '판이 끝남').toBe('ENDED');
    humans.forEach((h, i) => k.expectNoLeak(frames[i], mid, uid(h)));
    const people = [[user, 'JOKER'], [citizen, 'CITIZEN'], [t.bots[0], 'DOCTOR'], ...t.bots.slice(1).map((b) => [b, 'CITIZEN'])];
    for (const h of humans) await expectBoardJobs(h.page, people);
});

test('A15-H-002 10명 J2D2G2W2C2 사람 의사 2·사람 시민 1: 두 의사 화면엔 서로만 동료, 시민 화면엔 동료 없음, 셋 다 다른 직업 없음 @hard @game', async ({ user, players, table }) => {
    test.setTimeout(360_000);
    const doctor2 = await players.add();
    const citizen = await players.add();
    const humans = [user, doctor2, citizen];
    const frames = humans.map((h) => k.watchFrames(h.page));
    const { t } = await k.setupGame(table, {
        humans, bots: 7, counts: TEN, humanRoles: ['DOCTOR', 'DOCTOR', 'CITIZEN'],
        botRoles: ['JOKER', 'JOKER', 'GUARD', 'GUARD', 'WITCH_HUNTER', 'WITCH_HUNTER', 'CITIZEN'],
    });
    // 역할 창(10초 안에 봄): 의사는 "동료 의사"에 상대 의사만, 시민은 동료 줄 없음
    const reveal = (page) => page.getByRole('dialog', { name: '내 역할 보기' });
    await Promise.all([
        (async () => {
            await expect(reveal(user.page).getByText('동료 의사', { exact: true })).toBeVisible();
            await expect(reveal(user.page).getByRole('listitem')).toHaveText([nick(doctor2)]);
        })(),
        (async () => {
            await expect(reveal(doctor2.page).getByText('동료 의사', { exact: true })).toBeVisible();
            await expect(reveal(doctor2.page).getByRole('listitem')).toHaveText([nick(user)]);
        })(),
        (async () => {
            await expect(reveal(citizen.page)).toBeVisible();
            await expect(reveal(citizen.page).getByText(/동료/)).toHaveCount(0);
        })(),
    ]);
    // 1일 봇 시민 처형 → 1일 밤 광대 봇이 봇 경비원 암살 → 2일 낮
    const s = await k.playDayNight(t, { execute: uid(t.bots[6]), victim: uid(t.bots[2]) });
    for (const h of humans) {
        const mates = new Set(k.sameRoleMates(s, uid(h)));
        const others = [...humans, ...t.bots].filter((x) => x !== h && !mates.has(uid(x))).map(nick);
        await k.expectCardsHideRoles(h.page, others);
    }
    for (const [i, h] of humans.entries()) {
        await k.waitFrame(frames[i], 'night_result_applied');
        k.expectNoLeak(frames[i], s, uid(h));
    }
});

test('A15-H-003 8명 판 사람 경비원이 사람 시민 조사: 경비원 화면에만 결과 글, 시민 화면엔 글·받은 값 없음 @hard @game', async ({ user, players, table }) => {
    test.setTimeout(360_000);
    const citizen = await players.add();
    const humans = [user, citizen];
    const frames = humans.map((h) => k.watchFrames(h.page));
    const { t } = await k.setupGame(table, {
        humans, bots: 6, counts: { JOKER: 1, DOCTOR: 1, GUARD: 1 }, humanRoles: ['GUARD', 'CITIZEN'], botRoles: ['JOKER', 'DOCTOR', ...C(4)],
    });
    // 1일 낮은 아무도 안 냄 → 1일 밤 경비원 차례에 사람 경비원이 화면으로 시민 조사
    await pc.playNight({ t, page: user.page, me: 'GUARD', picks: { GUARD: citizen } });
    const s = await pc.toDay(t, 2);
    await pc.expectRoleResult(user.page, 'INVESTIGATE', citizen, 'CITIZEN');
    await k.waitFrame(frames[1], 'night_result_applied');
    expect(frames[1].filter((f) => f.event === 'night_action_result'), '시민이 받은 밤 결과').toEqual([]);
    await expect(pc.resultBox(citizen.page)).toHaveCount(0);
    await expect(citizen.page.getByRole('dialog', { name: '밤 조사 결과' })).toHaveCount(0);
    humans.forEach((h, i) => k.expectNoLeak(frames[i], s, uid(h), { needTribunal: false }));
});

test('A15-H-004 10명 판 1일 사람 시민 처형 → 2일 밤 사람 마녀사냥꾼이 확인: 마녀사냥꾼 화면에만 결과, 죽은 사람 화면엔 아무것도 없음 @hard @game', async ({ user, players, table }) => {
    test.setTimeout(420_000);
    const citizen = await players.add();
    const humans = [user, citizen];
    const frames = humans.map((h) => k.watchFrames(h.page));
    const { t } = await k.setupGame(table, {
        humans, bots: 8, counts: TEN, humanRoles: ['WITCH_HUNTER', 'CITIZEN'],
        botRoles: ['JOKER', 'JOKER', 'DOCTOR', 'DOCTOR', 'GUARD', 'GUARD', 'WITCH_HUNTER', 'CITIZEN'],
    });
    await k.playDayNight(t, { execute: uid(citizen), victim: null });
    // 2일 낮은 아무도 안 냄 → 2일 밤 마녀사냥꾼 차례에 사람이 화면으로 죽은 시민 확인
    await pc.playNight({ t, page: user.page, me: 'WITCH_HUNTER', night: 2, picks: { WITCH_HUNTER: citizen } });
    const s = await pc.toDay(t, 3);
    await pc.expectRoleResult(user.page, 'CONFIRM', citizen, 'CITIZEN');
    await expect.poll(() => frames[1].filter((f) => f.event === 'night_result_applied').length, { timeout: 15_000 }).toBeGreaterThanOrEqual(2);
    expect(frames[1].filter((f) => f.event === 'night_action_result'), '죽은 사람이 받은 밤 결과').toEqual([]);
    await expect(pc.resultBox(citizen.page)).toHaveCount(0);
    humans.forEach((h, i) => k.expectNoLeak(frames[i], s, uid(h)));
});

test('A15-H-005 7명 판 1일 사람 A(의사) 처형 → 판 끝까지 사람 B 화면·받은 값에 A 직업 없음, 끝난 뒤 결과판에만 @hard @game', async ({ user, players, table }) => {
    test.setTimeout(360_000);
    const b = await players.add();
    const frames = k.watchFrames(b.page);
    const { t } = await k.setupGame(table, { humans: [user, b], bots: 5, counts: { JOKER: 1, DOCTOR: 1 }, humanRoles: ['DOCTOR', 'CITIZEN'], botRoles: ['JOKER', ...C(4)] });
    // 1일 A 처형 → 밤 암살 없음 → 2일 낮
    const mid = await k.playScript(t, { executes: { 1: uid(user) }, until: (s) => s.phase === 'DAY' && s.dayIndex === 2 });
    expect(n.rowOf(mid, uid(user))?.alive, 'A 처형됨').toBe(false);
    // B 화면 A 카드: 직업 글 없음 (처형된 뒤에도)
    await k.expectCardsHideRoles(b.page, [nick(user)]);
    // 2일 광대 봇 처형 → 판 끝
    const end = await k.playScript(t, { executes: { 2: uid(t.bots[0]) }, until: (s) => s.phase === 'ENDED' });
    expect(end?.phase, '판이 끝남').toBe('ENDED');
    // 판 끝 값 앞까지 B가 받은 것: 남의 직업(A의 의사 포함) 없음, 재판 결과 값에 처형된 사람 직업·표 수 없음
    k.expectNoLeak(frames, mid, uid(b));
    await expectBoardJobs(b.page, [[user, 'DOCTOR']]);
});

test('A15-H-006 5명 판(사람 2 + 봇 3) + 로비 사람 1: 판 내내·판 끝 뒤에도 로비 화면이 받은 판 글 0개, 결과 값 없음 @hard @game', async ({ user, players, table }) => {
    test.setTimeout(300_000);
    const p2 = await players.add();
    const outsider = await players.add();
    const lobbyFrames = k.watchFrames(outsider.page);
    // 로비를 새로 열어 소켓부터 잡음
    await ui.gotoLobby(outsider.page);
    const { t } = await k.setupGame(table, { humans: [user, p2], bots: 3, counts: { JOKER: 1 }, humanRoles: ['JOKER', 'CITIZEN'], botRoles: C(3) });
    const start = await t.state();
    // 1일 사람 광대 처형 → 판 끝 → 결과 화면 닫기까지
    const end = await k.playScript(t, { executes: { 1: uid(user) }, until: (s) => s.phase === 'ENDED' });
    expect(end?.phase, '판이 끝남').toBe('ENDED');
    await expect(p2.page).toHaveURL(/\/gameresult/, { timeout: 30_000 });
    await t.closeResults();
    await expect(p2.page).toHaveURL(/\/lobby/, { timeout: 20_000 });
    await expect(outsider.page.getByRole('navigation', { name: '로비 메뉴' })).toBeVisible();
    expect(lobbyFrames.sockets, '로비 화면 소켓을 잡음').toBeGreaterThan(0);
    const about = k.framesAbout(lobbyFrames, { gameId: t.gameId, uuids: start.players.map((p) => p.uuid) });
    expect(about.map((f) => f.event), '로비 화면이 받은 판 글').toEqual([]);
    expect(lobbyFrames.filter((f) => f.raw.includes('winResult') || f.raw.includes('"reveals"')).map((f) => f.event), '로비 화면이 받은 결과 값').toEqual([]);
});
