'use strict';

// 재판 채팅·표 비공개 어려운 시험: 피고·투표자 말은 서로 보이고 죽은 사람 말은 죽은 사람만, 누가 무엇을 냈는지·표 수가 다른 사람 화면에 안 보임
// 목록 A04-H-024·025 (시험목록/A04-재판.md "브라우저 — 어려움")
const { test, expect } = require('../../helpers/fixtures');
const A = require('./_a04-multi');

const { trial } = A;

test('A04-H-024 재판 채팅: 피고와 투표자 말은 서로 보이고 죽은 사람 말은 죽은 사람 화면에만 (사람 3 + 봇 4 = 7명) @game @hard @smoke', async ({ user, players, table }) => {
    test.setTimeout(300_000);
    const b = await players.add();
    const c = await players.add();
    const people = [user, b, c];
    const t = await A.openTable(table, { humans: people, bots: 4, roles: A.plainRoles() });
    // 1일 밤 광대 봇이 C를 죽임 → 2일 재판: A(첫 사람)가 피고, B는 투표자, C는 죽은 사람
    await t.advanceUntil((s) => s.phase === 'NIGHT' && s.nightTurnRole === 'JOKER', { stepDelayMs: 500 });
    const kill = await t.bots[0].request('submit_night_action', { gameId: t.gameId, targetId: A.uuidOf(c) });
    expect(kill?.ok).toBe(true);
    await A.toVote(t, 2);
    // 낮 시작 연출(암살 영상)이 끝난 뒤에 재판으로 (연출이 채팅 보내기 단추를 덮지 않게)
    for (const p of [user, b]) await A.passDawn(p.page);
    await A.keepWatching(c.page);
    await A.toTribunal(t, user);
    for (const p of people) await expect(trial.win(p.page)).toBeVisible({ timeout: 15000 });
    await expect(trial.defendantNotice(user.page)).toBeVisible();
    await expect(trial.button(b.page, 'GUILTY')).toBeEnabled();
    await expect(trial.deadNotice(c.page)).toBeVisible();
    // 피고 말 → 투표자·죽은 사람 화면에 보임 (죽은 사람은 낮 말을 읽기만 함)
    const fromA = A.uniq('피고말');
    await A.sayInTrial(user.page, fromA);
    await expect(trial.chatLog(b.page)).toContainText(fromA, { timeout: 10000 });
    await expect(trial.chatLog(c.page)).toContainText(fromA, { timeout: 10000 });
    // 투표자 말 → 피고 화면에 보임
    const fromB = A.uniq('투표자말');
    await A.sayInTrial(b.page, fromB);
    await expect(trial.chatLog(user.page)).toContainText(fromB, { timeout: 10000 });
    // 죽은 사람 말 → 자기 화면에만
    const fromC = A.uniq('죽은말');
    await A.sayInTrial(c.page, fromC);
    await expect(trial.chatLog(c.page)).toContainText(fromC, { timeout: 10000 });
    // 그 뒤에 보낸 산 사람 말이 도착한 때에도 산 사람 화면엔 죽은 사람 말이 없음
    const marker = A.uniq('뒤에말');
    await A.sayInTrial(user.page, marker);
    await expect(trial.chatLog(b.page)).toContainText(marker, { timeout: 10000 });
    await expect(trial.chatLog(b.page)).not.toContainText(fromC);
    await expect(trial.chatLog(user.page)).not.toContainText(fromC);
});

test('A04-H-025 한 사람이 유죄를 내도 다른 두 사람 화면엔 그 표 값·표 수가 안 보임 (사람 3 + 봇 3 = 6명) @game @hard', async ({ user, players, table }) => {
    test.setTimeout(300_000);
    const b = await players.add();
    const c = await players.add();
    const people = [user, b, c];
    const logs = people.map((p) => A.socketLog(p.page));
    const { t } = await A.startTrial(table, { humans: people, bots: 3 });
    for (const p of [b, c]) await expect(trial.chat(p.page)).toBeVisible({ timeout: 10000 });
    const since = Date.now();
    await A.pressVote(user.page, 'GUILTY');
    await A.expectVoteAccepted(logs[0], 'GUILTY', 1);
    // 기다림 기준: 그 뒤에 보낸 봇 글이 두 화면에 도착할 때까지
    const marker = A.uniq('뒤에글');
    const reply = await t.bots[0].request('submit_game_chat_message', { gameId: t.gameId, text: marker });
    expect(reply?.ok).toBe(true);
    for (const [i, p] of [[1, b], [2, c]]) {
        await expect(trial.chatLog(p.page)).toContainText(marker, { timeout: 10000 });
        // 받은 소켓 글 어디에도 표 값이 없고, "표 냈음" 알림도 낸 사람에게만 감
        const got = logs[i].events.filter((e) => e.at >= since);
        expect(got.filter((e) => /GUILTY/.test(e.raw)).map((e) => e.event)).toEqual([]);
        expect(got.filter((e) => e.event === 'session_self_progress')).toHaveLength(0);
        // 화면: 단추는 그대로(완료 글 없음), "유죄"·"무죄"는 단추 글 하나씩뿐, 표 수 글 없음
        await expect(trial.done(p.page)).toHaveCount(0);
        await expect(trial.button(p.page, 'GUILTY')).toBeEnabled();
        const text = await trial.win(p.page).innerText();
        expect(text.match(/유죄/g)).toHaveLength(1);
        expect(text.match(/무죄/g)).toHaveLength(1);
        expect(text).not.toMatch(/\d\s*표/);
    }
});
