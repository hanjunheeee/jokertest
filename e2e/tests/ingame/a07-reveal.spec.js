'use strict';

// 판 끝 직업 공개 브라우저 시험 (PC) — 결과판에 전원 이름·직업 줄(죽은 사람·나간 사람도), 직업 이름 5종, 판 중엔 남의 직업이 안 보임
// 목록 시험목록/A07-승패-결과-골드.md A07-E-011~020, 모이는지만 봄: npx playwright test --list tests/ingame/a07-reveal.spec.js
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const n = require('./b-night/_night');
const k = require('./_a07-simple-kit');

const { C, uid, nick } = k;
const id = (no) => `A07-E-${String(no).padStart(3, '0')}`;

// 판 화면·결과판 어디서든 직업으로 읽힐 글 (지금 이름 5종 + 예전 이름 "귀족"·"주치의")
const JOB_WORDS = [...Object.values(k.JOB_TEXT), '귀족', '주치의'];

// 10명 판 직업 5종: 사람 시민 + 봇 [광대·광대·의사·경비원·마녀사냥꾼·시민 4] → 광대 봇 둘이 나가 시민 승 → 결과판
async function openFiveJobsResult(table, user) {
    const { t, page } = await k.open(table, user, 'CITIZEN', ['JOKER', 'JOKER', 'DOCTOR', 'GUARD', 'WITCH_HUNTER', ...C(4)]);
    const [j1, j2, doctor, guard, hunter, citizen] = t.bots;
    await k.leave(t, j1);
    await k.leave(t, j2);
    await k.reachBoard(page);
    return { t, page, j1, doctor, guard, hunter, citizen };
}

// A07-E-011~015: 결과판 줄 수 = 인원, 줄마다 직업 글
[5, 6, 7, 8, 10].forEach((size, i) => {
    const smoke = i === 0 ? ' @smoke' : '';
    test(`${id(11 + i)} ${size}명 판 끝 → 결과판 ${size}줄, 줄마다 이름·직업 글 @game${smoke}`, async ({ user, table }) => {
        test.setTimeout(180_000);
        const { t, page } = await k.open(table, user, 'CITIZEN', ['JOKER', ...C(size - 2)]);
        const [joker, ...citizens] = t.bots;
        await k.execute(t, uid(joker));
        await k.reachBoard(page);
        await expect(k.rows(page)).toHaveCount(size);
        await k.expectJobs(page, [[user, 'CITIZEN'], [joker, 'JOKER'], ...citizens.map((bot) => [bot, 'CITIZEN'])]);
        // 서버가 보낸 공개 줄도 인원만큼 (남은 봇이 끝난 판을 물어봄)
        expect((await n.publicWinResult(t, 1)).reveals).toHaveLength(size);
    });
});

test(`${id(16)} 10명 판 광대2·의사·경비원·마녀사냥꾼: 결과판에 직업 이름 5종이 다 읽힘 @game`, async ({ user, table }) => {
    test.setTimeout(180_000);
    const { page, j1, doctor, guard, hunter, citizen } = await openFiveJobsResult(table, user);
    // 시민은 "시민", 의사는 "의사" (결과판에 "귀족"·"주치의" 안 씀)
    for (const [bot, role] of [[j1, 'JOKER'], [citizen, 'CITIZEN'], [doctor, 'DOCTOR'], [guard, 'GUARD'], [hunter, 'WITCH_HUNTER']]) {
        await expectReadable(k.rowOf(page, nick(bot)).getByText(k.JOB_TEXT[role], { exact: true }));
    }
});

test(`${id(17)} 10명 판 마녀사냥꾼 봇 줄 이름은 "마녀사냥꾼" ("시민"·"귀족" 아님) @game`, async ({ user, table }) => {
    test.setTimeout(180_000);
    const { page, hunter } = await openFiveJobsResult(table, user);
    const row = k.rowOf(page, nick(hunter));
    await expectReadable(row.getByText('마녀사냥꾼', { exact: true }));
    // 시민 이름으로 잘못 나오면 안 됨 (지금 시민 글은 "시민", 예전 글은 "귀족")
    await expect(row.getByText('시민', { exact: true })).toHaveCount(0);
    await expect(row.getByText('귀족', { exact: true })).toHaveCount(0);
    // 마녀사냥꾼 글은 그 한 줄뿐
    await expect(k.rows(page).filter({ has: page.getByText('마녀사냥꾼', { exact: true }) })).toHaveCount(1);
});

test(`${id(18)} 6명 판 판 중엔 남의 직업 글이 없다가 결과판에서 처음 나옴 @game`, async ({ user, table }) => {
    const { t, page } = await k.open(table, user, 'CITIZEN', ['JOKER', ...C(4)]);
    const [joker, ...citizens] = t.bots;
    // 판 중: 남의 카드에 직업 글 없음
    await expect(page.locator('[data-ingame-player-nickname]')).toHaveCount(6);
    for (const bot of t.bots) {
        const cardText = await n.cardStatus(page, nick(bot)).innerText();
        for (const word of JOB_WORDS) expect(cardText, `${nick(bot)} 카드에 직업 글 "${word}"`).not.toContain(word);
    }
    // 판 중: 서버가 시민 봇에게 주는 판 값에도 남의 직업·공개 칸 없음
    const snap = await citizens[0].snapshot(t.gameId);
    expect(snap.winResult ?? null).toBeNull();
    for (const p of snap.players) expect(p.role ?? null, `${p.nickname} 직업 칸`).toBeNull();
    // 판 끝: 결과판에 전원 직업
    await k.execute(t, uid(joker));
    await k.reachBoard(page);
    await k.expectJobs(page, [[user, 'CITIZEN'], [joker, 'JOKER'], ...citizens.map((bot) => [bot, 'CITIZEN'])]);
});

test(`${id(19)} 7명 판 처형된 봇·암살된 봇 줄에도 직업 글 @game`, async ({ user, table }) => {
    test.setTimeout(180_000);
    const { t, page } = await k.open(table, user, 'CITIZEN', ['JOKER', ...C(5)]);
    const [joker, executed, killed] = t.bots;
    // 첫날 시민 처형 → 첫 밤 암살 → 둘째 날 광대 처형 (시민 승)
    await k.execute(t, uid(executed));
    const day2 = await k.nightKill(t, [joker], uid(killed));
    expect({ phase: day2.phase, day: day2.dayIndex }).toEqual({ phase: 'DAY', day: 2 });
    await k.execute(t, uid(joker));
    await k.reachBoard(page);
    await expect(k.rows(page)).toHaveCount(7);
    await k.expectJobs(page, [[executed, 'CITIZEN'], [killed, 'CITIZEN'], [joker, 'JOKER']]);
    // 서버 공개 줄: 둘 다 죽은 사람으로 직업과 같이 실림
    const { reveals } = await n.publicWinResult(t, 3);
    const revealOf = (bot) => reveals.find((r) => r.uuid === uid(bot));
    expect({ role: revealOf(executed).role, alive: revealOf(executed).alive, why: revealOf(executed).deathReason })
        .toEqual({ role: 'CITIZEN', alive: false, why: 'EXECUTION' });
    expect({ role: revealOf(killed).role, alive: revealOf(killed).alive, why: revealOf(killed).deathReason })
        .toEqual({ role: 'CITIZEN', alive: false, why: 'ASSASSINATION' });
});

test(`${id(20)} 8명 판 산 채로 나간 봇도 결과판 목록에 직업과 같이 있음, 골드 칸은 없음 @game`, async ({ user, table }) => {
    test.setTimeout(180_000);
    const { t, page } = await k.open(table, user, 'CITIZEN', ['JOKER', ...C(6)]);
    const [joker, leaver] = t.bots;
    await k.leave(t, leaver);
    await k.execute(t, uid(joker));
    await k.reachBoard(page);
    await expect(k.rows(page)).toHaveCount(8);
    const row = k.rowOf(page, nick(leaver));
    await expect(row).toHaveCount(1);
    await k.expectJobs(page, [[leaver, 'CITIZEN']]);
    await expect(row.getByTestId('game-result-gold-reward')).toHaveCount(0);
    // 서버 공개 줄: 나간 사람 받은 골드 0, 끝까지 있던 사람(나)은 1
    const { reveals } = await n.publicWinResult(t, 2);
    expect(reveals.find((r) => r.uuid === uid(leaver)).goldReward).toBe(0);
    expect(reveals.find((r) => r.uuid === uid(user)).goldReward).toBe(1);
});
