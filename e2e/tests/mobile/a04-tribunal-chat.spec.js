'use strict';

// 모바일 재판 채팅 시험: 재판 창 채팅에 봇 글이 보임, 피고인 나도 말함, 재판 중 카톡 채팅방은 숨김, 재판이 끝나면 채팅방 다시 + 죽음 알림 줄
// 목록 A04-E-086·088·091·092 (시험목록/A04-재판.md "브라우저 — 간단" 모바일 몫)
const { test, expect } = require('../../helpers/fixtures');
const { talk } = require('./_talk');
const A = require('../ingame/_a04-multi');

const { trial } = A;

test('A04-E-086 재판 중 산 봇이 쓴 글이 재판 창 채팅에 보임 (모바일 6명) @game @smoke', async ({ user, table }) => {
    const page = user.page;
    const { t } = await A.startTrial(table, { humans: [user], bots: 5 });
    const text = A.uniq('봇반론');
    const reply = await t.bots[1].request('submit_game_chat_message', { gameId: t.gameId, text });
    expect(reply?.ok).toBe(true);
    await expect(trial.chatLog(page)).toContainText(text, { timeout: 10000 });
});

test('A04-E-088 피고인 나도 재판 창 채팅에 글을 쓰고 봇이 그 글을 받음 (모바일 8명) @game', async ({ user, table }) => {
    const page = user.page;
    const { t } = await A.startTrial(table, { humans: [user], bots: 7, pick: () => user });
    await expect(trial.defendantNotice(page)).toBeVisible();
    const text = A.uniq('내반론');
    await A.sayInTrial(page, text);
    await expect(trial.chatLog(page)).toContainText(text, { timeout: 10000 });
    await expect.poll(() => t.bots[1].events.some((e) => e.event === 'day_chat_message_received' && e.payload?.text === text), { message: '봇이 피고 글을 받음' }).toBe(true);
});

test('A04-E-091 재판 중엔 카톡 채팅방이 안 보이고 바닥 입력칸이 없음, 재판 창 채팅만 (모바일 6명) @game', async ({ user, table }) => {
    const page = user.page;
    await A.startTrial(table, { humans: [user], bots: 5 });
    await expect(trial.chat(page)).toBeVisible({ timeout: 10000 });
    await expect(talk.log(page)).toBeHidden();
    // 입력칸은 재판 창 채팅 안 하나뿐
    await expect(page.getByRole('textbox', { name: '채팅 입력' })).toHaveCount(1);
    await expect(trial.chat(page).getByRole('textbox', { name: '채팅 입력' })).toBeVisible();
});

test('A04-E-092 유죄로 재판이 끝나면 채팅방이 다시 보이고 처형 알림 줄이 있음 (모바일 7명) @game', async ({ user, table }) => {
    const page = user.page;
    const { t, d } = await A.startTrial(table, { humans: [user], bots: 6 });
    await A.pressVote(page, 'GUILTY');
    await A.endTribunal(t);
    await expect(trial.expulsion(page)).toBeVisible({ timeout: 15000 });
    // 추방 연출이 끝난 뒤
    await expect(trial.expulsion(page)).toHaveCount(0, { timeout: 30000 });
    await expect(talk.log(page)).toBeVisible();
    await expect(talk.system(page).filter({ hasText: `${d.nickname}님이 죽었습니다` })).toBeVisible();
});
