'use strict';

// 재판 거절·지운 요청·새는 값 브라우저 시험 (PC): 서버가 표를 거절하면 까닭 글이 읽힘, 지운 "재판 판정" 요청을 보내도 판정 안 됨, 재판 동안 화면이 받은 값에 남의 직업 없음
// 목록 docs/게임_의도_2026-11-15/시험목록/A04-재판.md A04-E-080·156·159·160
const { test, expect } = require('../../helpers/fixtures');
const c = require('./c-chat/_lib');
const K = require('./_a04-pc');

const { TEXT, uuidOf } = K;

test('A04-E-080 PC 6명 판 서버가 재판 표를 거절 → 재판 창 위에 까닭 글이 읽히고 단추는 그대로 @game @smoke', async ({ user, table }) => {
    // 거절 만들기: 화면이 보내는 재판 표의 날짜를 하루 앞으로 바꿔 보냄 → 서버가 "지난 재판"으로 거절
    await K.hookSocket(user.page);
    const t = await K.seat(table, user, { n: 6 });
    const page = user.page;
    await K.expectHooked(page);
    const defendant = t.bots[2];
    await K.toFirstDay(t);
    await K.openTribunal(t, uuidOf(defendant));
    await K.expectTribunal(page, defendant.nickname);
    await K.setNet(page, { stale: true });
    await K.guilty(page).click();
    const reason = K.voteError(page);
    await expect(reason).toHaveText(TEXT.STALE_DAY);
    await K.readable(reason, { uncovered: false });
    // 거절이라 낸 것이 아님 → 단추가 남고, 서버에도 표가 없음 (마감하면 0 : 0 무죄)
    await K.expectVoteButtons(page);
    await expect(K.tribunal(page).getByText(TEXT.DONE)).toHaveCount(0);
    const after = await K.closeTribunal(t);
    expect(after.players.find((p) => p.uuid === uuidOf(defendant)).alive).toBe(true);
});

test('A04-E-156 PC 5명 판 다 낸 뒤 화면 소켓으로 지운 판정 요청(resolve_tribunal_vote)을 보냄 → 바로 판정 안 되고 재판 창 그대로 @game', async ({ user, table }) => {
    await K.hookSocket(user.page);
    const t = await K.seat(table, user, { n: 5 });
    const page = user.page;
    await K.expectHooked(page);
    const defendant = t.bots[2];
    await K.toFirstDay(t);
    await K.openTribunal(t, uuidOf(defendant));
    await K.expectTribunal(page, defendant.nickname);
    // 옛 판정 단추는 "다 냈을 때"만 먹었음 → 다 낸 상태로 만듦 (판정은 서버가 5초 뒤 스스로)
    await K.press(page, TEXT.NOT_GUILTY);
    const voters = t.bots.filter((b) => b !== defendant);
    await K.botsVerdict(t, 'NOT_GUILTY', voters);
    await K.sendRaw(page, 'resolve_tribunal_vote', { gameId: t.gameId, dayIndex: 1 });
    // 봇 요청 한 번을 뒤따라 보내 서버가 앞 요청을 처리할 틈을 줌 → 그래도 재판 중
    const snap = await voters[0].snapshot(t.gameId);
    expect(snap.phase).toBe('TRIBUNAL');
    expect(snap.tribunal.resolved).not.toBe(true);
    const s = await t.state();
    expect(s.phase).toBe('TRIBUNAL');
    expect(s.tribunal.resolved).toBe(false);
    await expect(K.tribunal(page)).toBeVisible();
});

// 화면이 받은 값 속 직업 이름 찾기: 내 정보(self)만 뺌 → ['players[2].role=JOKER', …]
// (재판 결과 알림의 처형된 사람 직업 칸 executedRole은 이제 값에서도 빠짐 — 결정 2026-11-16 아침 1번 → 남아 있으면 여기 걸림)
const ROLE_VALUES = new Set(['JOKER', 'DOCTOR', 'GUARD', 'WITCH_HUNTER', 'CITIZEN']);
function roleLeaks(value, path = '', out = []) {
    if (Array.isArray(value)) value.forEach((v, i) => roleLeaks(v, `${path}[${i}]`, out));
    else if (value !== null && typeof value === 'object') {
        for (const [key, v] of Object.entries(value)) {
            if (key === 'self') continue;
            roleLeaks(v, path ? `${path}.${key}` : key, out);
        }
    } else if (typeof value === 'string' && ROLE_VALUES.has(value)) out.push(`${path}=${value}`);
    return out;
}

[
    [159, 5, ['JOKER'], 2],
    // 10명 판: 특수 직업 다 있음, 피고는 광대 2 중 하나 (판이 안 끝남)
    [160, 10, ['JOKER', 'JOKER', 'DOCTOR', 'GUARD', 'WITCH_HUNTER'], 0],
].forEach(([no, n, bots, defendantIndex]) => {
    test(`A04-E-${no} PC ${n}명 판 재판 진입부터 판정까지 화면이 받은 소켓 값 → 남의 직업 없음, 재판 결과 알림에 처형 직업·표 수 칸 없음 @game`, async ({ user, table }) => {
        // 소켓 엿보기는 붙인 뒤 생긴 소켓만 봄 → 판 차리기가 방 코드 화면을 새로 열 때 붙음
        const frames = c.watchSocket(user.page);
        const t = await K.seat(table, user, { n, bots });
        const page = user.page;
        const defendant = t.bots[defendantIndex];
        await K.toFirstDay(t);
        await K.openTribunal(t, uuidOf(defendant));
        await K.expectTribunal(page, defendant.nickname);
        await K.press(page, TEXT.GUILTY);
        await K.botsVerdict(t, 'GUILTY', t.bots.filter((b) => b !== defendant));
        await K.closeTribunal(t);
        await expect.poll(() => frames.some((f) => f.event === 'tribunal_vote_resolved'), { message: '화면이 재판 결과 알림을 받음' }).toBe(true);
        const from = frames.findIndex((f) => f.event === 'day_vote_resolved' && f.payload?.outcome === 'TRIBUNAL');
        const to = frames.findIndex((f) => f.event === 'tribunal_vote_resolved');
        expect(from, '화면이 재판 진입 알림을 받음 (엿보기가 안 붙었으면 -1)').toBeGreaterThanOrEqual(0);
        expect(to).toBeGreaterThan(from);
        const window = frames.slice(from, to + 1);
        // 재판 진입·내 진행·마감 당김·결과가 다 들어 있어야 뜻이 있음
        expect(window.map((f) => f.event)).toEqual(expect.arrayContaining(['day_vote_resolved', 'session_self_progress', 'tribunal_vote_resolved']));
        const leaks = window.flatMap((f) => roleLeaks(f.payload).map((hit) => `${f.event}: ${hit}`));
        expect(leaks).toEqual([]);
        // 재판 결과 알림엔 처형된 사람 직업·표 수 칸 자체가 없음 (화면에 안 그려도 개발 도구로 보이면 직업이 샘)
        const resolved = frames[to].payload;
        expect(resolved.outcome).toBe('GUILTY');
        expect(resolved.executedUuid).toBe(uuidOf(defendant));
        expect(Object.keys(resolved)).not.toContain('executedRole');
        expect(Object.keys(resolved)).not.toContain('counts');
    });
});
