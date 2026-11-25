'use strict';

// 모바일 재판 채팅 시험: 재판 중 봇 글이 채팅방에 보임, 피고인 나도 말함, 재판 중 입력칸은 바닥 하나(재판 시트엔 없음), 재판이 끝나면 채팅방에 죽음 알림 줄
// 목록 A04-E-086·088·091·092 (시험목록/A04-재판.md "브라우저 — 간단" 모바일 몫)
// 합친 뒤 세로 카톡형: 재판 창 안 "최후의 반론 채팅" 칸이 없어지고, 고발 연출(1.5초 남짓) 뒤 말은 채팅방·바닥 입력 줄 그대로 씀
// (frontend-mobile talk/TalkLayout.jsx·overlays/tribunal/TribunalSheet.jsx) — 누가 말하고 누가 보는지 규칙은 같게 봄
const { test, expect } = require('../../helpers/fixtures');
const { talk, say, waitTrialTalk, openTrialSheet, closeTrialSheet } = require('./_talk');
const A = require('../ingame/_a04-multi');

const { trial } = A;

test('A04-E-086 재판 중 산 봇이 쓴 글이 채팅방에 보임 (모바일 6명) @game @smoke', async ({ user, table }) => {
    const page = user.page;
    const { t } = await A.startTrial(table, { humans: [user], bots: 5 });
    await waitTrialTalk(page);
    const text = A.uniq('봇반론');
    const reply = await t.bots[1].request('submit_game_chat_message', { gameId: t.gameId, text });
    expect(reply?.ok).toBe(true);
    await expect(talk.others(page).filter({ hasText: text })).toBeVisible({ timeout: 10000 });
});

test('A04-E-088 피고인 나도 재판 중 채팅방에 글을 쓰고 봇이 그 글을 받음 (모바일 8명) @game', async ({ user, table }) => {
    const page = user.page;
    const { t } = await A.startTrial(table, { humans: [user], bots: 7, pick: () => user });
    // 피고 안내 글은 "최후의 변론" 시트 안
    await openTrialSheet(page);
    await expect(trial.defendantNotice(page)).toBeVisible();
    await waitTrialTalk(page);
    const text = A.uniq('내반론');
    await say(page, text);
    await expect.poll(() => t.bots[1].events.some((e) => e.event === 'day_chat_message_received' && e.payload?.text === text), { message: '봇이 피고 글을 받음' }).toBe(true);
});

test('A04-E-091 재판 중에도 채팅방이 보이고 입력칸은 바닥 하나, "최후의 변론" 시트엔 입력칸 없음 (모바일 6명) @game', async ({ user, table }) => {
    const page = user.page;
    await A.startTrial(table, { humans: [user], bots: 5 });
    // 시트(피고 카드·유죄·무죄)엔 채팅 입력칸이 없음
    const sheet = await openTrialSheet(page);
    await expect(sheet.getByRole('textbox', { name: '채팅 입력' })).toHaveCount(0);
    await closeTrialSheet(page);
    await waitTrialTalk(page);
    await expect(talk.log(page)).toBeVisible();
    // 옛 재판 창 채팅 칸은 없고 입력칸은 채팅방 바닥 것 하나뿐
    await expect(trial.chat(page)).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: '채팅 입력' })).toHaveCount(1);
    await expect(talk.input(page)).toBeEnabled();
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
