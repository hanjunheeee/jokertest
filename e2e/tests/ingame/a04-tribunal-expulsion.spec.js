'use strict';

// 추방 연출 브라우저 시험 (PC): 연출 중엔 결과 화면으로 안 감, 연출 뒤 밤 안내, 추방 글 이름 = 피고 닉네임, 연출 뒤 밤 행동이 바로 됨
// 목록 docs/게임_의도_2026-11-15/시험목록/A04-재판.md A04-E-151·152·154·155
const { test, expect } = require('../../helpers/fixtures');
const { waitResult } = require('../room/roomHelpers');
const K = require('./_a04-pc');

const { TEXT, uuidOf } = K;

// n명 판에서 봇 표로 defendantIndex번 봇을 처형 (사람은 안 냄), 화면 기록도 검 → 마감 뒤 판 요약(판이 끝나 빠졌으면 null)
async function execute(table, user, n, { me = 'CITIZEN', bots = ['JOKER'], defendantIndex = 2 } = {}) {
    const t = await K.seat(table, user, { n, me, bots });
    const defendant = t.bots[defendantIndex];
    await K.toFirstDay(t);
    await K.watchScreen(user.page);
    await K.openTribunal(t, uuidOf(defendant));
    await K.expectTribunal(user.page, defendant.nickname);
    await K.botsVerdict(t, 'GUILTY', t.bots.filter((b) => b !== defendant));
    const after = await K.closeTribunal(t);
    return { t, defendant, after, page: user.page };
}

test('A04-E-151 PC 5명 판 하나뿐인 광대 처형 → 추방 연출 동안 주소는 /ingame, 끝나면 /gameresult @game @smoke', async ({ user, table }) => {
    const { defendant, page } = await execute(table, user, 5, { defendantIndex: 0 });
    await K.expectExpelled(page, defendant.nickname);
    await expect(page).toHaveURL(/\/ingame/);
    await waitResult(page);
    await expect(page).toHaveURL(/\/gameresult/);
    // 연출이 떠 있던 내내 판 화면 주소였음 (주소가 먼저 바뀌었다면 연출이 결과 화면 위에서 찍힘)
    const rec = await K.readScreen(page);
    expect(rec.expulsions.length).toBeGreaterThan(0);
    for (const row of rec.expulsions) expect(row.path).toBe('/ingame');
});

test('A04-E-152 PC 7명 판 유죄 → 추방 연출이 끝나면 "밤이 되었습니다" 안내 @game', async ({ user, table }) => {
    const { defendant, after, page } = await execute(table, user, 7);
    expect(after.phase).toBe('NIGHT');
    await K.expectExpelled(page, defendant.nickname);
    // 연출이 떠 있는 동안엔 밤 안내가 안 뜸
    await expect(K.phaseNotice(page)).toBeHidden();
    // 연출은 저절로 끝남 (누르지 않고 기다림)
    await expect(K.expulsion(page)).toBeHidden({ timeout: 15000 });
    await K.expectNightNotice(page);
});

test('A04-E-154 PC 8명 판 유죄 → 추방 글 이름이 피고 봇 닉네임 @game', async ({ user, table }) => {
    const { t, defendant, page } = await execute(table, user, 8);
    await K.expectExpelled(page, defendant.nickname);
    const shown = (await K.readScreen(page)).expulsions.map((row) => row.text).filter((text) => text.includes('추방'));
    expect(shown).toEqual([TEXT.expel(defendant.nickname)]);
    // 다른 사람 이름으로 나온 적 없음
    for (const bot of t.bots.filter((b) => b !== defendant)) expect(shown.join(' ')).not.toContain(bot.nickname);
});

test('A04-E-155 PC 6명 판(나 의사) 유죄 → 추방 연출이 끝나면 의사 차례에 대상 고르기가 바로 됨 @game', async ({ user, table }) => {
    const { t, defendant, page } = await execute(table, user, 6, { me: 'DOCTOR' });
    await K.expectExpelled(page, defendant.nickname);
    await K.passExpulsion(page);
    await K.night.toTurn(t, 'DOCTOR', { dayIndex: 1 });
    // 카드 메뉴 "보호"로 산 봇 하나를 고름 → 메뉴가 닫히면 낸 것
    const since = Date.now();
    await K.night.nightActUi(page, t.bots[1].nickname, '보호');
    // 의사는 나 하나 → 서버가 내 대상을 받았으면 그 차례가 다 찬 것이라 마감 당김 알림이 옴
    const settle = await t.bots[0].waitForEvent('phase_settle_started', { match: (p) => p?.phase === 'NIGHT' && p?.role === 'DOCTOR', since, timeoutMs: 8000 });
    expect(settle.dayIndex).toBe(1);
});
