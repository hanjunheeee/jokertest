'use strict';

// PC 탈주 대기 중 방 만들기 거절 브라우저 시험 — 산 채로 나간 뒤 "탈주로 ○분 ○초 뒤에…" 알림 글(1번째 5분·2번째 30분·3번째 1일)과 화면에 남는 안내 띠, 다시 누르면 남은 초가 줆, 죽은 뒤 나감·끊김 60초 탈락
// 목록 A01a-방만들기-설정-시작.md 번호 A01-E-098~100·133~135, 돌리지 않고 모임만: npx playwright test --list tests/room/a01-desertion-create.spec.js
const { test, expect } = require('../../helpers/fixtures');
const { e2e } = require('../../helpers/internal');
const { sleep } = require('../../helpers/wait');
const A9 = require('../ingame/_a09-simple-kit');
const K = require('./_a01a-kit');

// 진짜 시간 허용 폭 (시험_계획 3-5)
const SLACK_S = 1.5;

/** 판 앉히고(사람 시민) 첫 낮에 산 채로 나감 → 판 */
async function desertAlive(table, user, n = 5) {
    const t = await A9.seat(table, user, { n });
    await A9.toDay(t);
    await A9.leaveAlive(user.page);
    return t;
}

test('A01-E-098 5명 판 산 채로 나감 → 방 만들기 → "탈주로 4분 5x초 뒤에 참여할 수 있습니다." @game @smoke', async ({ user, table }) => {
    await desertAlive(table, user);
    const text = await A9.createRoomAlert(user.page);
    expect(text).toMatch(/^탈주로 4분 5\d초 뒤에 참여할 수 있습니다\.$/);
    // 알림 창을 닫은 뒤에도 같은 글이 화면 안내 띠에 남아 읽힘 (PC)
    await K.expectEntryNotice(user.page, text);
    expect(await e2e.roomOf(K.U(user))).toBeNull();
});

test('A01-E-099 거절 5초 뒤 다시 눌러도 거절, 글의 남은 초가 5초쯤 줆, 방 없음 @game @realtime', async ({ user, table }) => {
    await desertAlive(table, user);
    const first = await A9.createRoomAlert(user.page);
    const firstAt = Date.now();
    const s1 = K.waitSecondsOf(first);
    expect(s1, `첫 글 모양: ${first}`).not.toBeNull();
    // 남은 시간이 실제로 주는지 보는 시험이라 진짜로 5초 기다림
    await sleep(5000);
    const second = await A9.createRoomAlert(user.page);
    const gap = (Date.now() - firstAt) / 1000;
    const s2 = K.waitSecondsOf(second);
    expect(s2, `둘째 글 모양: ${second}`).not.toBeNull();
    expect(s2).toBeLessThan(s1);
    expect(Math.abs((s1 - s2) - gap), `줄어든 초 ${s1 - s2} ≈ 지난 초 ${gap.toFixed(1)}`).toBeLessThanOrEqual(SLACK_S + 1);
    expect(await e2e.roomOf(K.U(user))).toBeNull();
});

test('A01-E-100 6명 판에서 사람이 처형돼 죽은 뒤 나감 → 방 만들어짐 (탈주 아님) @game', async ({ user, table }) => {
    test.setTimeout(180_000);
    const t = await A9.seat(table, user, { n: 6 });
    await A9.execute(t, K.U(user));
    await A9.pressDeadExit(user.page, { accept: true });
    await A9.createRoomOk(user.page);
    await K.waitRoom(K.U(user));
});

// A01-E-133·134: DB에 넣는 줄은 이미 풀린 지난 탈주(그 줄만으론 안 막힘) — 서버가 진짜 탈주를 적을 때 오늘 줄 수를 DB에서 세어 몇 번째인지 정함
test('A01-E-133 오늘 탈주 1줄 있는 계정이 5명 판 산 채로 나감 → "탈주로 29분 5x초 뒤에…" @game', async ({ user, table }) => {
    await K.seedTodayDesertions(K.U(user), 1);
    await desertAlive(table, user);
    const text = await A9.createRoomAlert(user.page);
    expect(text).toMatch(/^탈주로 29분 5\d초 뒤에 참여할 수 있습니다\.$/);
});

test('A01-E-134 오늘 탈주 2줄 있는 계정이 5명 판 산 채로 나감 → "탈주로 23시간 59분 …" @game', async ({ user, table }) => {
    await K.seedTodayDesertions(K.U(user), 2);
    await desertAlive(table, user);
    const text = await A9.createRoomAlert(user.page);
    expect(text).toMatch(/^탈주로 23시간 59분 \d{1,2}초 뒤에 참여할 수 있습니다\.$/);
});

test('A01-E-135 5명 판 사람 탭 닫음 → 끊김 60초 바로 끝냄(손잡이) → 새 창 로그인 → 방 만들기 → "탈주로 …" @game', async ({ user, table, players }) => {
    const t = await A9.seat(table, user, { n: 5 });
    await A9.toDay(t);
    await user.page.close();
    // 서버가 끊김을 알아채 60초 기다림을 건 뒤에 손잡이로 끝냄 (60초 규칙 자체를 보는 시험이 아님)
    await expect.poll(async () => (await t.expireGraces()).fired?.includes(K.U(user)) ?? false, { timeout: 20_000 }).toBe(true);
    const again = await players.add({ account: user.account });
    const text = await A9.createRoomAlert(again.page);
    expect(text).toMatch(/^탈주로 4분 \d{1,2}초 뒤에 참여할 수 있습니다\.$/);
    expect(await e2e.roomOf(K.U(user))).toBeNull();
});
