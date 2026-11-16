'use strict';

// 관리자 금지어 브라우저 시험 (PC 크기) — 넣으면 닉네임 바꾸기 거절·판 채팅에서 *로 가림, 같은 단어 다시 넣기 "이미 있음", 끄면 닉네임 바꾸기 됨
// 목록 시험목록/A14-관리자.md 번호 A14-E-040~043 — 금지어 목록은 서버 전체가 같이 써서 전부 @serial, 끝에 넣은 단어를 지움 / 모임만: npx playwright test --list tests/admin/a14-banned-words.spec.js
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { removeBannedWords } = require('../../helpers/bannedWords');
const { skipIntro } = require('../../helpers/ui');
const A = require('../ingame/_a04-multi');
const N = require('../ingame/b-night/_night');
const L = require('../ingame/a-day/_lib');
const k = require('./_a14-kit');

const { E } = k;
const BANNED_NICKNAME = '사용할 수 없는 단어가 들어간 닉네임입니다.';
const NICKNAME_CHANGED = '닉네임이 변경되었습니다.';

// 금지어 화면 → 단어 넣기 → 반영 안내까지 (반영 안내 글에 그 단어)
async function addWordUi(page, word) {
    await k.goMenu(page, '금지어');
    await expect(k.heading(page, '금지어')).toBeVisible();
    await page.getByLabel('넣을 금지어', { exact: true }).fill(word);
    await page.getByRole('button', { name: '넣기', exact: true }).click();
}

// 플레이어 계정 관리 화면에서 닉네임 바꾸기 → 결과 글 줄
async function changeNickname(page, nickname) {
    await page.goto('/account');
    await skipIntro(page);
    const section = page.locator('section').filter({ has: page.getByRole('heading', { name: '닉네임 변경', exact: true }) });
    await section.getByPlaceholder('새 닉네임').fill(nickname);
    await section.getByRole('button', { name: '변경' }).click();
    return section;
}

test(`${E(40)} 금지어 넣기 → 플레이어 닉네임 바꾸기에 그 단어 → 거절 글 @serial @smoke`, async ({ browser, players }) => {
    const word = L.randomWord();
    const player = await k.openPlayer(players);
    const w = await k.openAdmin(browser);
    try {
        await addWordUi(w.page, word);
        await expect(w.page.getByRole('status').filter({ hasText: `'${word}' 금지어를 켰어요.` })).toBeVisible();
        const section = await changeNickname(player.page, `${word}1`);
        await expectReadable(section.getByText(BANNED_NICKNAME, { exact: true }));
    } finally {
        await removeBannedWords([word]);
        await w.close();
    }
});

test(`${E(41)} 금지어 넣기 → 사람 1 + 봇 4 = 5명 판 낮 채팅에 그 단어 → 채팅 줄에 * 로 가림 @serial @game`, async ({ browser, players, table }) => {
    const word = L.randomWord();
    const player = await k.openPlayer(players);
    const w = await k.openAdmin(browser);
    try {
        await addWordUi(w.page, word);
        await expect(w.page.getByRole('status').filter({ hasText: `'${word}' 금지어를 켰어요.` })).toBeVisible();
        const t = await A.openTable(table, { humans: [player], bots: 4, roles: A.plainRoles() });
        await N.toDay(t);
        await A.calm(player.page);
        // 봇이 그 단어를 말함 → 받는 사람(브라우저) 채팅 줄에 같은 길이 *
        const reply = await L.botChat(t, t.bots[1], `안녕 ${word} 반가워`);
        expect(reply?.ok, `봇 채팅 ${reply?.code ?? ''}`).toBe(true);
        const log = L.chatLog(player.page);
        await expect(log).toContainText(`안녕 ${'*'.repeat(word.length)} 반가워`);
        await expect(log).not.toContainText(word);
        await expectReadable(log.getByText(`안녕 ${'*'.repeat(word.length)} 반가워`));
    } finally {
        await removeBannedWords([word]);
        await w.close();
    }
});

test(`${E(42)} 같은 단어 다시 넣기 → "이미 있음" 글 @serial`, async ({ browser }) => {
    const word = L.randomWord();
    const w = await k.openAdmin(browser);
    try {
        await addWordUi(w.page, word);
        await expect(w.page.getByRole('status').filter({ hasText: `'${word}' 금지어를 켰어요.` })).toBeVisible();
        await addWordUi(w.page, word);
        await expectReadable(w.page.getByText('이미 있는 단어예요.', { exact: true }));
    } finally {
        await removeBannedWords([word]);
        await w.close();
    }
});

test(`${E(43)} 금지어 끄기 → 그 단어 닉네임 바꾸기 됨 @serial`, async ({ browser, players }) => {
    const word = L.randomWord();
    const player = await k.openPlayer(players);
    const w = await k.openAdmin(browser);
    try {
        await addWordUi(w.page, word);
        await expect(w.page.getByRole('status').filter({ hasText: `'${word}' 금지어를 켰어요.` })).toBeVisible();
        // 다른 시험이 넣은 단어도 있어 찾기 칸으로 이 단어만
        await w.page.getByLabel('찾기', { exact: true }).fill(word);
        await w.page.getByRole('button', { name: `${word} 끄기`, exact: true }).click();
        await expect(w.page.getByRole('status').filter({ hasText: `'${word}' 금지어를 껐어요.` })).toBeVisible();
        const section = await changeNickname(player.page, `${word}2`);
        await expectReadable(section.getByText(NICKNAME_CHANGED, { exact: true }));
    } finally {
        await removeBannedWords([word]);
        await w.close();
    }
});
