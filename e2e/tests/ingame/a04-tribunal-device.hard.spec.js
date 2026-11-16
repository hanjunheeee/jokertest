'use strict';

// 재판 중 기기·방장이 바뀌는 어려운 시험: 같은 계정이 모바일로 로그인하면 재판을 이어받고 PC는 로그아웃, 방장(사람)이 나가도 재판 그대로이고 판 끝 뒤 대기방 방장은 다음 사람
// 목록 A04-H-026·037 (시험목록/A04-재판.md "브라우저 — 어려움")
const { test, expect, e2e } = require('../../helpers/fixtures');
const { hostGame } = require('../room/roomHelpers');
const A = require('./_a04-multi');

const { trial } = A;

test('A04-H-026 재판 중 같은 계정으로 모바일에서 로그인하면 모바일에 재판 창·단추, PC는 로그아웃 (사람 2 + 봇 4 = 6명) @game @hard @smoke', async ({ user, players, table }) => {
    test.setTimeout(300_000);
    const b = await players.add();
    const { t, d } = await A.startTrial(table, { humans: [user, b], bots: 4 });
    // 밀려난 PC 창에 뜨는 알림 창은 바로 닫음
    user.page.on('dialog', (dialog) => { dialog.accept().catch(() => {}); });
    const phone = await players.add({ mobile: true, account: user.account, lobby: false });
    const log = A.socketLog(phone.page);
    await phone.page.goto('/ingame');
    await expect(trial.win(phone.page)).toBeVisible({ timeout: 20000 });
    // 재판 중 새 기기로 돌아오면 역할 창을 안 띄움 (재판 단추를 가려 투표를 놓칠 수 있어서, 사용자 결정 2026-11-16 일곱째 고를 것 4)
    // 판 상태를 받은 뒤 창이 뜰 틈(3초)을 줘도 안 뜸
    const reveal = phone.page.getByRole('dialog', { name: '내 역할 보기' });
    const revealShown = await reveal.waitFor({ state: 'visible', timeout: 3000 }).then(() => true, () => false);
    expect(revealShown, '재판 중 돌아왔는데 역할 창이 뜸').toBe(false);
    // 다른 안내 창이 떠 있으면 닫고 봄 (전처럼)
    await A.calm(phone.page, undefined, { keepWatching: false });
    await A.expectCardReadable(phone.page, d.nickname);
    await A.expectButtonsReadable(phone.page);
    await expect(user.page).toHaveURL(/\/login/, { timeout: 20000 });
    // 모바일에서 누른 표가 그 사람 표로 들어감 (유죄 1표뿐 → 처형), 다른 사람 화면은 재판 그대로였음
    await expect(trial.win(b.page)).toBeVisible();
    await A.pressVote(phone.page, 'GUILTY');
    await A.expectVoteAccepted(log, 'GUILTY', 1);
    const s = await A.endTribunal(t);
    expect(A.playerOf(s, A.uuidOf(d)).alive).toBe(false);
});

test('A04-H-037 재판 중 방장(사람)이 나가도 재판 그대로, 판이 끝난 뒤 대기방 방장은 다음 사람 (사람 3 + 봇 4 = 7명) @game @hard', async ({ user, players, bots }) => {
    test.setTimeout(420_000);
    const g1 = await players.add();
    const g2 = await players.add();
    const botList = await bots.spawn(4);
    // 방장이 사람이어야 해서 화면으로 방을 만듦: 자리 순서는 방장 → 손님 1 → 손님 2 → 봇
    const roles = { [A.uuidOf(user)]: 'CITIZEN', [A.uuidOf(g1)]: 'CITIZEN', [A.uuidOf(g2)]: 'CITIZEN', [A.uuidOf(botList[0])]: 'JOKER' };
    const t = await hostGame({ host: user, guests: [g1, g2], botList, roles, settings: { maxPlayers: 7, vote: 90, tribunal: 120 } });
    await A.afterStart(t, roles);
    await A.toVote(t, 1);
    const d = botList[0];
    await A.toTribunal(t, d);
    for (const p of [user, g1, g2]) await expect(trial.win(p.page)).toBeVisible({ timeout: 15000 });
    // 재판 중엔 위 줄 "게임 나가기"가 잠겨 있어 뒤로 가기 → 나가기 확인 창으로 나감
    await A.leaveByBack(user.page);
    await expect.poll(async () => (await t.player(A.uuidOf(user)))?.alive, { message: '나간 방장은 죽은 것으로' }).toBe(false);
    // 다음 방장 = 판 자리(판 시작 때 섞인 순서, 서버 판 요약 players 순서)에서 맨 앞부터 처음 나오는 참여 중인 사람 (결정 2026-11-16 "판 중에 방장이 빠질 때")
    // 방 들어온 순서(방장 → 손님 → 봇)가 아님 — 봇이 될 수도 있음
    const next = (await t.state()).players.find((p) => p.uuid !== A.uuidOf(user) && p.isParticipating !== false);
    const nextHuman = [g1, g2].find((p) => A.uuidOf(p) === next.uuid) ?? null;
    const nextBot = botList.find((b) => A.uuidOf(b) === next.uuid) ?? null;
    for (const p of [g1, g2]) {
        await expect(trial.win(p.page)).toBeVisible();
        await expect(trial.button(p.page, 'GUILTY')).toBeEnabled();
    }
    expect((await t.state()).phase).toBe('TRIBUNAL');
    // 판을 끝냄: 남은 둘이 유죄 → 하나뿐인 광대 처형 → 시민 승
    for (const p of [g1, g2]) await A.pressVote(p.page, 'GUILTY');
    const s = await A.endTribunal(t);
    expect(s.phase).toBe('ENDED');
    await Promise.all([g1, g2].map((p) => A.expectResult(p.page, A.TEXT.citizenWin)));
    for (const p of [g1, g2]) {
        await p.page.getByRole('button', { name: '대기방으로' }).click();
        await expect(p.page).toHaveURL(/\/game-matching/, { timeout: 15000 });
    }
    // 판이 끝날 때의 방장 자리는 그 사람 것으로 남겨 둠 → 봇이면 봇도 "대기방으로" 해야 방장이 됨
    if (nextBot) {
        const reply = await nextBot.request('return_to_room', { gameId: t.gameId });
        expect(reply?.ok, `방장 봇 대기방으로 답 ${JSON.stringify(reply)}`).toBe(true);
    }
    for (const p of [g1, g2]) {
        const start = p.page.getByRole('button', { name: '게임시작' });
        if (p === nextHuman) await expect(start).toBeVisible();
        else await expect(start).toHaveCount(0);
    }
    expect((await e2e.roomOf(A.uuidOf(g1)))?.hostUuid, '서버 방장 = 판 자리 맨 앞의 참여 중인 사람').toBe(next.uuid);
});
