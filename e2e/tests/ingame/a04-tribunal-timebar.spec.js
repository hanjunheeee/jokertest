'use strict';

// 재판 시간 바 브라우저 시험 (PC): 재판 시간 설정대로 시작 남은 시간, 재판 단계 글, 판정 뒤 밤으로, 15초 마감 경계(진짜 시간), 낮 5초 당김 뒤에도 재판 시간 전체
// 목록 docs/게임_의도_2026-11-15/시험목록/A04-재판.md A04-E-093~096·099·161·162·164·171·176
const { test, expect } = require('../../helpers/fixtures');
const K = require('./_a04-pc');

const { TEXT, uuidOf } = K;

// n명 판 차리고 낮에 시간 바를 펼쳐 둠 (재판 연출 중엔 저절로 펼쳐지지만, 재판 뒤 밤에도 단계 글을 보려면 내가 펼쳐 둬야 함) + 화면 기록
async function seatWithBar(table, user, n, settings) {
    const t = await K.seat(table, user, { n, settings });
    await K.toFirstDay(t);
    await K.expandBar(user.page);
    await K.watchScreen(user.page);
    return t;
}

// 재판에 들어간 순간 시간 바에 처음 찍힌 남은 시간 글 (올림이라 시작 뒤 1초 동안은 설정값 그대로)
async function firstTribunalClock(page) {
    let row = null;
    await expect.poll(async () => { row = K.firstTribunalBar(await K.readScreen(page)); return row !== null; }, { message: '재판 단계 시간 바 글' }).toBe(true);
    return row.clock;
}

[
    // [번호, 인원, 방 설정, 시작 글] — 96은 재판 시간을 안 정해 낮 투표 시간(90초)을 따름
    [93, 5, { tribunalTime: 15 }, '0:15'],
    [94, 6, { tribunalTime: 60 }, '1:00'],
    [95, 8, { tribunalTime: 120 }, '2:00'],
    [96, 10, { tribunalTime: undefined, dayVoteTime: 90 }, '1:30'],
].forEach(([no, n, settings, clock], i) => {
    const smoke = i === 0 ? ' @smoke' : '';
    const label = settings.tribunalTime ? `재판 ${settings.tribunalTime}초` : '재판 시간 안 정함·낮 투표 90초';
    test(`A04-E-0${no} PC ${n}명 판 ${label} → 재판 시간 바가 ${clock}에서 시작 @game${smoke}`, async ({ user, table }) => {
        const t = await seatWithBar(table, user, n, settings);
        await K.openTribunal(t, uuidOf(t.bots[2]));
        await K.expectTribunal(user.page);
        expect(await firstTribunalClock(user.page)).toContain(clock);
    });
});

test('A04-E-176 PC 8명 판 재판 45초 → 재판 시간 바가 0:45에서 시작 @game', async ({ user, table }) => {
    const t = await seatWithBar(table, user, 8, { tribunalTime: 45 });
    await K.openTribunal(t, uuidOf(t.bots[2]));
    await K.expectTribunal(user.page);
    expect(await firstTribunalClock(user.page)).toContain('0:45');
});

test('A04-E-099 PC 6명 판 재판(무죄) → 밤이면 시간 바 단계 글이 밤 @game', async ({ user, table }) => {
    const t = await seatWithBar(table, user, 6, {});
    const page = user.page;
    await K.openTribunal(t, uuidOf(t.bots[2]));
    await K.expectTribunal(page);
    const bar = K.timebar(page);
    await expect(bar).toContainText(TEXT.TRIBUNAL_BAR);
    expect((await K.closeTribunal(t)).phase).toBe('NIGHT');
    await K.day.closeNotice(page, TEXT.NIGHT);
    const nightLabel = bar.getByText(/^\[밤-.+\]$/);
    await K.readable(nightLabel, { uncovered: false, timeout: 20000 });
    await expect(bar).not.toContainText(TEXT.TRIBUNAL_BAR);
});

test('A04-E-171 PC 6명 판 재판 중 → 시간 바에 "재판"·"진행 중" 글이 읽힘 @game', async ({ user, table }) => {
    const t = await seatWithBar(table, user, 6, {});
    const page = user.page;
    await K.openTribunal(t, uuidOf(t.bots[2]));
    await K.expectTribunal(page);
    const label = K.timebar(page).getByText(TEXT.TRIBUNAL_BAR, { exact: true });
    await expect(label).toContainText('재판');
    await expect(label).toContainText('진행 중');
    // 시간 바는 재판 창보다 위에 그려지지만 잠긴 판 화면 안이라 가려짐 검사는 뺌
    await K.readable(label, { uncovered: false });
});

[[161, -1000, '14초엔 재판 창 그대로'], [162, 1000, '16초엔 닫힘']].forEach(([no, offsetMs, what]) => {
    test(`A04-E-${no} PC 6명 판 재판 15초, 아무도 안 냄 → ${what} @game @realtime`, async ({ user, table }) => {
        const t = await K.seat(table, user, { n: 6, settings: { tribunalTime: 15 } });
        const page = user.page;
        await K.toFirstDay(t);
        const { deadline } = await K.openTribunal(t, uuidOf(t.bots[2]));
        await K.expectTribunal(page);
        // 손잡이 없이 진짜로 기다림 (마감 = 재판 시작 + 15초)
        await K.sleepUntil(deadline + offsetMs);
        const s = await t.state();
        if (offsetMs < 0) {
            // 마감까지 1초뿐이라 바로 보고 끝냄 (기다리는 확인을 쓰면 마감을 넘김)
            expect(s.phase).toBe('TRIBUNAL');
            expect(await K.tribunal(page).isVisible()).toBe(true);
            expect(await K.guilty(page).isEnabled()).toBe(true);
        } else {
            expect(s.phase).toBe('NIGHT');
            await expect(K.tribunal(page)).toBeHidden({ timeout: 500 });
        }
    });
});

test('A04-E-164 PC 7명 판 재판 60초, 낮 투표를 다 내 5초 당김 → 재판 시간 바는 1:00에서 시작 @game @realtime', async ({ user, table }) => {
    const t = await seatWithBar(table, user, 7, { tribunalTime: 60 });
    const page = user.page;
    const defendant = t.bots[2];
    await K.day.toVote(t);
    // 나도 화면으로 피고를 찍고, 봇은 다 냄(피고 봇은 기권) → 산 사람 표가 다 참
    await K.day.voteUi(page, defendant.nickname);
    await K.day.botsVote(t, uuidOf(defendant), t.bots.filter((b) => b !== defendant));
    const since = Date.now();
    expect((await K.day.botVote(t, defendant, null))?.ok).toBe(true);
    const votedAt = Date.now();
    // 손잡이 없이 5초(±1.5초) 뒤 재판
    await K.expectTribunal(page, defendant.nickname);
    const resolved = await t.bots[0].waitForEvent('day_vote_resolved', { match: (p) => p?.outcome === 'TRIBUNAL', since });
    const rec = await K.readScreen(page);
    expect(Math.abs(rec.opened.at(-1) - (votedAt + 5000))).toBeLessThanOrEqual(1500);
    // 재판 마감 = 재판 진입 + 60초 (낮에 줄어든 5초와 상관없음)
    expect(Math.abs(resolved.tribunalDeadline - (rec.opened.at(-1) + 60_000))).toBeLessThanOrEqual(1500);
    expect(await firstTribunalClock(page)).toContain('1:00');
});
