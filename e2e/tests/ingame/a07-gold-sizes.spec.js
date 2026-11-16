'use strict';

// 인원마다 판 골드 브라우저 시험 (PC) — 5~10명 판 내 줄 "+1골드", 장부 줄 수 = 판 끝까지 있던 사람 수 (산 채로 나간 사람·60초 탈락자는 빠지고 죽은 사람은 들어감)
// 목록 시험목록/A07-승패-결과-골드.md A07-E-106~113·138, 모이는지만 봄: npx playwright test --list tests/ingame/a07-gold-sizes.spec.js
const { test, expect } = require('../../helpers/fixtures');
const { query } = require('../../helpers/db');
const k = require('./_a07-simple-kit');

const { C, uid, nick } = k;
const id = (no) => `A07-E-${String(no).padStart(3, '0')}`;

// 시민 승으로 끝내고 결과판 → 판 끝 처리(전적·판 골드)까지 끝남: 봇 표로 광대(t.bots[0]) 처형
async function citizenWin(t, page, voters = null) {
    const end = await k.execute(t, uid(t.bots[0]), voters);
    expect(end.winResult?.winner).toBe('CITIZEN');
    await k.reachBoard(page);
    await k.settled(t, t.bots[1]);
}

// 그 판 판 골드 장부를 받은 사람 uuid 목록 (정렬)
const rewarded = async (t) => (await k.rewardRows(t.gameId)).map((r) => r.user_id).sort();
const uuids = (people) => people.map(uid).sort();

// A07-E-106~110: 인원마다 내 줄 "+1골드"
[5, 6, 7, 8, 10].forEach((size, i) => {
    const smoke = i === 0 ? ' @smoke' : '';
    test(`${id(106 + i)} ${size}명 판 결과판 내 줄 "+1골드" @game${smoke}`, async ({ user, table }) => {
        test.setTimeout(180_000);
        const { t, page } = await k.open(table, user, 'CITIZEN', ['JOKER', ...C(size - 2)]);
        await citizenWin(t, page);
        await expect(k.rows(page)).toHaveCount(size);
        await expect(k.rowOf(page, nick(user)).getByTestId('game-result-gold-reward')).toHaveText('+1골드');
        await expect(k.goldCells(page)).toHaveCount(1);
    });
});

test(`${id(111)} 10명 판 2명이 산 채로 나감 → 그 판 GAME_REWARD 장부 8줄 (나간 둘은 없음) @game`, async ({ user, table }) => {
    test.setTimeout(180_000);
    const { t, page } = await k.open(table, user, 'CITIZEN', ['JOKER', ...C(8)]);
    const [left1, left2] = t.bots.slice(7);
    await k.leave(t, left1);
    await k.leave(t, left2);
    await citizenWin(t, page);
    expect(await rewarded(t)).toEqual(uuids([user, ...t.bots.filter((bot) => bot !== left1 && bot !== left2)]));
    expect(await k.rewardRows(t.gameId)).toHaveLength(8);
});

test(`${id(112)} 7명 판 처형 2·암살 1 → 죽은 사람도 받아 장부 7줄 @game`, async ({ user, table }) => {
    test.setTimeout(180_000);
    const { t, page } = await k.open(table, user, 'CITIZEN', ['JOKER', ...C(5)]);
    const [joker, executed, killed] = t.bots;
    // 첫날 시민 처형 → 첫 밤 암살 → 둘째 날 광대 처형 (처형 2·암살 1)
    await k.execute(t, uid(executed));
    const day2 = await k.nightKill(t, [joker], uid(killed));
    expect({ phase: day2.phase, day: day2.dayIndex }).toEqual({ phase: 'DAY', day: 2 });
    await citizenWin(t, page);
    expect(await rewarded(t)).toEqual(uuids([user, ...t.bots]));
    expect(await k.rewardRows(t.gameId)).toHaveLength(7);
});

test(`${id(113)} 5명 판 끝까지 → 장부 5줄, 사람마다 지갑 골드 = 장부 골드 합 @game`, async ({ user, table }) => {
    const { t, page } = await k.open(table, user, 'CITIZEN', ['JOKER', ...C(3)]);
    await citizenWin(t, page);
    const people = [user, ...t.bots];
    expect(await rewarded(t)).toEqual(uuids(people));
    for (const who of people) {
        const [{ total }] = await query(
            "SELECT COALESCE(SUM(amount), 0) AS total FROM economy_ledger_entries WHERE user_id = ? AND currency = 'GOLD'", [uid(who)],
        );
        expect(await k.gold(uid(who)), `${nick(who)} 지갑 = 장부 합`).toBe(Number(total));
        expect(Number(total), `${nick(who)} 판 골드 1이 들어 있음`).toBeGreaterThanOrEqual(1);
    }
});

test(`${id(138)} 10명 판 끊겨 60초 뒤 탈락한 봇(손잡이) → 판 끝나도 그 봇 장부 0줄 @game`, async ({ user, table }) => {
    test.setTimeout(180_000);
    const { t, page } = await k.open(table, user, 'CITIZEN', ['JOKER', ...C(8)]);
    const dropped = t.bots[8];
    // 60초 규칙 자체는 A09 몫 → 손잡이로 바로 탈락
    await k.dropOut(t, dropped);
    await k.expectStillPlaying(t, page);
    await citizenWin(t, page);
    const got = await rewarded(t);
    expect(got).not.toContain(uid(dropped));
    expect(got).toEqual(uuids([user, ...t.bots.filter((bot) => bot !== dropped)]));
});
