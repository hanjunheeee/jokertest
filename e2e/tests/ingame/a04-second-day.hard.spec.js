'use strict';

// 둘째 날 재판 어려운 시험(받은 버그 8): 사람 여럿이 1일 재판 뒤 2일·3일 재판에서도 유죄·무죄 단추를 보고 누름 (새로고침 없이), PC·모바일 섞임, 밤 조사 결과 창·낮 5초 당김·낮 시작 연출 뒤
// 목록 A04-H-001·002·003·005·031·038·039 (시험목록/A04-재판.md "브라우저 — 어려움")
const { test, expect } = require('../../helpers/fixtures');
const A = require('./_a04-multi');
const N = require('./b-night/_night');

const { trial } = A;
const lastBot = (t, back = 1) => t.bots[t.bots.length - back];

// 그 날 재판을 열고 사람 화면마다 재판 창이 뜰 때까지
async function openDay(t, day, defendant) {
    await A.toVote(t, day);
    await A.toTribunal(t, defendant);
    for (const h of t.humans) await expect(trial.win(h.page)).toBeVisible({ timeout: 15000 });
}

// 사람마다 완료 글이 미리 떠 있지 않고 단추가 읽히는지 (버그 8: 단추 대신 "투표가 완료되었습니다."가 뜨던 것)
async function expectButtonsFor(people) {
    for (const p of people) {
        await expect(trial.done(p.page)).toHaveCount(0);
        await A.expectButtonsReadable(p.page);
    }
}

test('A04-H-001 [버그 8] 사람 둘이 1일 재판에서 유죄를 누른 뒤 2일 재판에서도 단추를 보고 누르면 서버가 받음 (사람 2 + 봇 5 = 7명) @game @hard @smoke', async ({ user, players, table }) => {
    test.setTimeout(300_000);
    const b = await players.add();
    const people = [user, b];
    const logs = people.map((p) => A.socketLog(p.page));
    const { t, d } = await A.startTrial(table, { humans: people, bots: 5 });
    // 1일: 둘 다 유죄, 봇은 기권 → 처형
    for (const p of people) await A.pressVote(p.page, 'GUILTY');
    const s1 = await A.endTribunal(t);
    expect(A.playerOf(s1, A.uuidOf(d)).alive).toBe(false);
    // 2일: 새로고침 없이 두 화면 다 단추
    const d2 = lastBot(t, 2);
    await openDay(t, 2, d2);
    await expectButtonsFor(people);
    // 봇 하나가 무죄 → 두 사람 유죄가 다 세어져야 2:1 처형 (하나라도 기권으로 빠지면 1:1 풀려남)
    await A.botsTribunal(t, [[t.bots[0], 'NOT_GUILTY']]);
    for (const [i, p] of people.entries()) {
        await A.pressVote(p.page, 'GUILTY');
        await A.expectVoteAccepted(logs[i], 'GUILTY', 2);
        expect(await A.navigationType(p.page)).toBe('navigate');
    }
    const s2 = await A.endTribunal(t);
    expect(A.playerOf(s2, A.uuidOf(d2)).alive).toBe(false);
});

test('A04-H-002 [버그 8] 1일에 누른 사람·안 누른 사람·피고였던 사람 모두 2일 재판 단추를 봄 (사람 3 + 봇 5 = 8명) @game @hard', async ({ user, players, table }) => {
    test.setTimeout(300_000);
    const b = await players.add();
    const c = await players.add();
    const people = [user, b, c];
    const logs = people.map((p) => A.socketLog(p.page));
    // 1일: C가 피고, A는 무죄를 누르고 B는 안 누름(기권) → 0:1 무죄
    const { t } = await A.startTrial(table, { humans: people, bots: 5, pick: () => c });
    await A.expectNoticeReadable(trial.defendantNotice(c.page));
    await A.pressVote(user.page, 'NOT_GUILTY');
    await expect(trial.button(b.page, 'GUILTY')).toBeEnabled();
    const s1 = await A.endTribunal(t);
    expect(A.playerOf(s1, A.uuidOf(c)).alive).toBe(true);
    // 2일: 봇이 피고 → 셋 다 단추, 누르면 서버가 받음
    await openDay(t, 2, lastBot(t));
    await expectButtonsFor(people);
    for (const [i, p] of people.entries()) {
        await A.pressVote(p.page, 'GUILTY');
        await A.expectVoteAccepted(logs[i], 'GUILTY', 2);
        expect(await A.navigationType(p.page)).toBe('navigate');
    }
});

test('A04-H-003 [버그 8] 사흘 연달아 재판: 두 사람이 날마다 단추를 보고 누르면 서버가 받음 (사람 2 + 봇 8 = 10명) @game @hard', async ({ user, players, table }) => {
    test.setTimeout(420_000);
    const b = await players.add();
    const people = [user, b];
    const logs = people.map((p) => A.socketLog(p.page));
    const { t, d } = await A.startTrial(table, { humans: people, bots: 8 });
    // 같은 봇이 사흘 내내 피고: 1일 둘 다 무죄 / 2일 둘 다 유죄 + 봇 무죄 3 (2:3) → 계속 풀려남
    const plan = [[1, 'NOT_GUILTY'], [2, 'GUILTY'], [3, 'GUILTY']];
    for (const [day, vote] of plan) {
        if (day > 1) await openDay(t, day, d);
        await expectButtonsFor(people);
        if (day === 2) await A.botsTribunal(t, 'NOT_GUILTY', (await A.votersOf(t, d)).slice(0, 3));
        for (const [i, p] of people.entries()) {
            await A.pressVote(p.page, vote);
            await A.expectVoteAccepted(logs[i], vote, day);
        }
        if (day < 3) {
            const s = await A.endTribunal(t);
            expect(A.playerOf(s, A.uuidOf(d)).alive).toBe(true);
        }
    }
    for (const p of people) expect(await A.navigationType(p.page)).toBe('navigate');
});

test('A04-H-005 [버그 8] PC 사람과 모바일 사람이 1일 재판에서 누른 뒤 2일 재판에서도 둘 다 단추 (사람 2 + 봇 3 = 5명) @game @hard', async ({ user, players, table }) => {
    test.setTimeout(300_000);
    const phone = await players.add({ mobile: true });
    const people = [user, phone];
    const logs = people.map((p) => A.socketLog(p.page));
    // 5명 판은 봇 표(2)가 기권(3)보다 적어 두 사람도 화면으로 낮 투표
    const { t, d } = await A.startTrial(table, { humans: people, bots: 3 });
    for (const p of people) await A.pressVote(p.page, 'NOT_GUILTY');
    const s1 = await A.endTribunal(t);
    expect(A.playerOf(s1, A.uuidOf(d)).alive).toBe(true);
    await openDay(t, 2, d);
    await expectButtonsFor(people);
    // 봇 하나가 무죄 → 두 사람 유죄가 다 세어져야 2:1 처형
    await A.botsTribunal(t, [[t.bots[0], 'NOT_GUILTY']]);
    for (const [i, p] of people.entries()) {
        await A.pressVote(p.page, 'GUILTY');
        await A.expectVoteAccepted(logs[i], 'GUILTY', 2);
        expect(await A.navigationType(p.page)).toBe('navigate');
    }
    const s2 = await A.endTribunal(t);
    expect(A.playerOf(s2, A.uuidOf(d)).alive).toBe(false);
});

test('A04-H-031 [버그 8] 밤 조사 결과 창이 떠 있던 경비원도 창을 닫으면 2일 재판 단추, 다른 사람도 단추 (사람 2 + 봇 6 = 8명) @game @hard', async ({ user, players, table }) => {
    test.setTimeout(300_000);
    const b = await players.add();
    const people = [user, b];
    // 8명 판 자동 구성엔 경비원 1 → 첫 사람을 경비원으로
    const { t, d } = await A.startTrial(table, { humans: people, bots: 6, roles: A.plainRoles({ [user.account.uuid]: 'GUARD' }) });
    for (const p of people) await A.pressVote(p.page, 'NOT_GUILTY');
    await A.endTribunal(t);
    // 1일 밤 경비원 차례에 봇 하나를 조사 → 낮이 되면 조사 결과 창
    await t.advanceUntil((s) => s.phase === 'NIGHT' && s.nightTurnRole === 'GUARD', { stepDelayMs: 500 });
    await N.nightActUi(user.page, t.bots[1].nickname, N.ACTION_LABELS.GUARD);
    await A.toVote(t, 2, { screens: false });
    const result = user.page.getByRole('dialog', { name: '밤 조사 결과' });
    await expect(result).toBeVisible({ timeout: 20000 });
    // 결과 창을 안 닫은 채 2일 재판 진입 (봇 표만으로 재판)
    await A.toTribunal(t, d, { humansVote: false });
    await expect(trial.win(b.page)).toBeVisible({ timeout: 15000 });
    await expectButtonsFor([b]);
    await expect(result).toBeVisible();
    await result.getByRole('button', { name: '확인' }).click();
    await expect(result).toBeHidden();
    await expectButtonsFor([user]);
    for (const p of people) await A.pressVote(p.page, 'GUILTY');
});

test('A04-H-038 [버그 8] 2일 낮 투표를 다 내 5초 뒤 재판이 열려도 두 사람 다 단추 (사람 2 + 봇 4 = 6명) @game @hard @realtime', async ({ user, players, table }) => {
    test.setTimeout(300_000);
    const b = await players.add();
    const people = [user, b];
    const { t, d } = await A.startTrial(table, { humans: people, bots: 4 });
    for (const p of people) await A.pressVote(p.page, 'NOT_GUILTY');
    await A.endTribunal(t);
    await A.toVote(t, 2);
    // 2일 낮: 산 사람 6명이 다 냄 (피고 봇은 다른 봇을 찍음, 사람은 화면으로) → 손잡이 없이 5초 뒤 판정
    await A.botsDayVote(t, A.uuidOf(d), t.bots.filter((x) => x !== d));
    await A.botsDayVote(t, A.uuidOf(t.bots[0]), [d]);
    await A.dayVoteUi(user.page, d.nickname);
    await A.expectNoSettle(user.page);
    await A.dayVoteUi(b.page, d.nickname);
    // 서버가 판 전원에게 알린 당긴 마감 (봇도 같은 알림을 받음) — 받은 시각과 마감 시각으로 5초를 봄
    await t.bots[0].waitForEvent('phase_settle_started', { match: (p) => p.phase === 'DAY', timeoutMs: 5000 });
    const pulled = t.bots[0].events.findLast((e) => e.event === 'phase_settle_started' && e.payload?.phase === 'DAY');
    A.expectNear(pulled.payload.deadline - pulled.at, 5000, '다 낸 뒤 판정까지');
    await A.expectSettleShown(user.page);
    for (const p of people) await trial.win(p.page).waitFor({ state: 'visible', timeout: 10000 });
    A.expectNear(Date.now(), pulled.payload.deadline, '당겨진 마감에 재판이 열림');
    await expectButtonsFor(people);
    for (const p of people) await A.pressVote(p.page, 'GUILTY');
});

test('A04-H-039 1일 밤 암살 → 2일 낮 시작 연출이 끝난 뒤 2일 재판 창·단추, 둘이 안 겹침 (사람 2 + 봇 5 = 7명) @game @hard', async ({ user, players, table }) => {
    test.setTimeout(300_000);
    const b = await players.add();
    const people = [user, b];
    const { t } = await A.startTrial(table, { humans: people, bots: 5 });
    for (const p of people) await A.pressVote(p.page, 'NOT_GUILTY');
    await A.endTribunal(t);
    // 1일 밤 광대 봇이 봇 하나를 죽임
    const victim = t.bots[1];
    await t.advanceUntil((s) => s.phase === 'NIGHT' && s.nightTurnRole === 'JOKER', { stepDelayMs: 500 });
    const kill = await t.bots[0].request('submit_night_action', { gameId: t.gameId, targetId: A.uuidOf(victim) });
    expect(kill?.ok).toBe(true);
    await A.toVote(t, 2, { screens: false });
    // 낮 시작 연출(영상 + 글, 영상이 안 되면 글 창)이 두 화면에 뜨고 끝남
    for (const p of people) await expect(p.page.getByText(`지난밤 ${victim.nickname}님이 살해당했습니다`).first()).toBeVisible({ timeout: 20000 });
    for (const p of people) await A.passDawn(p.page);
    // 2일 재판: 재판 창·단추가 읽히고(안 가려짐) 낮 시작 연출은 남아 있지 않음
    await A.toTribunal(t, lastBot(t));
    for (const p of people) {
        await expect(trial.win(p.page)).toBeVisible({ timeout: 15000 });
        await expect(A.dawnReport(p.page)).toHaveCount(0);
    }
    await expectButtonsFor(people);
    for (const p of people) await A.pressVote(p.page, 'GUILTY');
});
