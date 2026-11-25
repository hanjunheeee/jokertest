'use strict';

// 모바일 나가기 확인 창 브라우저 시험 — 산 사람·죽은 사람·결과 화면·뒤로 가기 글, 취소·확인, 연결이 끊긴 채 나가기 실패 안내
// 목록 A09-끊김-나가기-탈주.md 번호 A09-E-002·004·006·008·010·012·074 (모바일 줄) — 앞 단계는 손잡이로 넘김
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { talk, getExecuted } = require('./_talk');
const K = require('../ingame/_a09-simple-kit');
const H = require('../ingame/_a09-hard-kit');

// 판 앉히고 첫 낮까지, 화면 단계 줄이 따라올 때까지
async function seatAtDay(table, user, n) {
    const t = await K.seat(table, user, { n });
    await K.toDay(t);
    await expect(talk.phaseLine(user.page)).toContainText('낮', { timeout: 15_000 });
    return t;
}

test('A09-E-002 모바일 6명 판, 산 채로 "게임 나가기" → 확인 창에 패배·골드·탈주 제한 글 @game @smoke', async ({ user, table }) => {
    await seatAtDay(table, user, 6);
    const message = await K.pressExit(user.page, { accept: false });
    for (const line of K.EXIT_ALIVE_LINES) expect(message).toContain(line);
});

test('A09-E-004 모바일 8명 판, 처형된 뒤 "게임 나가기" → 벌 없음 글, 패배 글 없음 @game', async ({ user, table }) => {
    test.setTimeout(180_000);
    const page = user.page;
    const t = await K.seat(table, user, { n: 8 });
    await getExecuted(t, K.U(user), { pages: [page], keepWatching: false });
    const message = await K.pressDeadExit(page, { accept: false });
    expect(message).toContain(K.EXIT_DEAD_LINE);
    expect(message).not.toContain('패배');
    expect(message).not.toContain('다른 방에 들어갈 수 없습니다');
});

test('A09-E-006 모바일 5명 판, 확인 창에서 취소 → 판 화면·단계 그대로 @game', async ({ user, table }) => {
    const page = user.page;
    const t = await seatAtDay(table, user, 5);
    const before = await t.state();
    await K.pressExit(page, { accept: false });
    await expect(page).toHaveURL(/\/ingame/);
    await expect(talk.layout(page)).toBeVisible();
    await expect(talk.phaseLine(page)).toContainText('제 1일');
    await expect(talk.phaseLine(page)).toContainText('낮');
    await expectReadable(talk.phaseLine(page));
    const after = await t.state();
    expect(`${after.phase}/${after.dayPhase}/${after.dayIndex}`).toBe(`${before.phase}/${before.dayPhase}/${before.dayIndex}`);
    const me = K.rowOf(after, K.U(user));
    expect(me.alive, '서버 판에서 산 채').toBe(true);
    expect(me.isParticipating, '서버 판에 참여 중').toBe(true);
});

test('A09-E-008 모바일 7명 판, 확인 창에서 확인 → 방 목록 화면, 판에서는 죽음 @game', async ({ user, table }) => {
    const page = user.page;
    const t = await seatAtDay(table, user, 7);
    await K.leaveAlive(page);
    await expect(page.getByRole('region', { name: '공개 방 목록' })).toBeVisible();
    await expect.poll(async () => {
        const me = await t.player(K.U(user));
        return `${me?.alive}/${me?.isParticipating}`;
    }, { timeout: 15_000, message: '판 상태: 생존/참여' }).toBe('false/false');
});

test('A09-E-010 모바일 5명 판, 결과 화면 "로비로" → 확인 창 "로비로 나가시겠습니까?" @game', async ({ user, table }) => {
    test.setTimeout(180_000);
    const page = user.page;
    const t = await K.seat(table, user, { n: 5 });
    await K.toCitizenWin(t, page);
    const lobby = page.getByRole('button', { name: '로비로', exact: true });
    await expectReadable(lobby);
    const message = await K.withConfirm(page, () => lobby.click(), { accept: false });
    expect(message).toBe(K.EXIT_RESULT_TEXT);
    // 취소했으니 결과 화면 그대로
    await expect(page).toHaveURL(/\/gameresult/);
});

test('A09-E-012 모바일 6명 판, 판 중 산 채로 뒤로 가기 → 산 사람 확인 창 글 @game', async ({ user, table }) => {
    const page = user.page;
    const t = await seatAtDay(table, user, 6);
    await K.clear(page);
    // 브라우저 뒤로 가기 (대기방 → 판 화면으로 온 기록이 있음)
    const message = await K.withConfirm(page, () => page.evaluate(() => window.history.back()), { accept: false });
    for (const line of K.EXIT_ALIVE_LINES) expect(message).toContain(line);
    await expect(page).toHaveURL(/\/ingame/);
    expect((await t.player(K.U(user))).isParticipating).toBe(true);
});

test('A09-E-074 모바일 5명 판, 네트워크 끊고 나가기 확인 → "게임에서 나가지 못했습니다." + 연결 끊김 글, 사망 글 없음 @game', async ({ user, table }) => {
    test.setTimeout(180_000);
    const page = user.page;
    const me = K.U(user);
    // 화면 소켓 길목 (판에 들어가기 전에 걺): 브라우저 오프라인 흉내는 열린 소켓을 바로 안 끊어 화면이 끊긴 줄 아는 때가 들쭉날쭉함
    const gate = await H.socketGate(user);
    const t = await seatAtDay(table, user, 5);
    await K.clear(page);
    try {
        // 화면 소켓을 끊고 새 접속도 거절 → 서버가 끊김을 알렸으면 화면 소켓도 끊긴 것
        await H.goOffline(t, user, gate);
        await K.pressExit(page, { accept: true });
        const notice = K.leaveNotice(page);
        await expectReadable(notice.getByText('게임에서 나가지 못했습니다.', { exact: true }));
        await expectReadable(notice.getByText('연결이 끊겨 나가기를 보내지 못했습니다. 다시 시도해 주세요.', { exact: true }));
        await expect(page.getByText('당신은 사망했습니다.')).toHaveCount(0);
        await expect(K.deadChoice(page)).toHaveCount(0);
        await expect(page).toHaveURL(/\/ingame/);
        // 나가기가 안 갔으니 서버 판에선 산 채
        expect((await t.player(me)).alive).toBe(true);
    } finally {
        await gate.open();
    }
});
