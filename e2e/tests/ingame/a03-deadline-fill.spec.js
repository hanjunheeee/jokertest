'use strict';

// 마감까지 안 낸 표 브라우저 시험 (PC) — 다 안 차면 투표 30초 끝에 판정, 안 낸 표는 기권으로 셈(기권이 많으면 재판 없음)
// 목록 A03-낮투표.md 번호 A03-E-266~271·278·280 — 시간 끝 규칙이라 손잡이로 안 넘기고 진짜로 기다림(@realtime)
const { test, expect, ui } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { sleep } = require('../../helpers/wait');
const L = require('./a-day/_lib');

// 결과 값 → 현황 창 글 (화면 InGameVoteStatusContent.jsx 글)
const OUTCOME_LABEL = Object.freeze({ TRIBUNAL: '재판 회부', TIE: '동점', ABSTAIN_MAJORITY: '기권이 많아 재판 없음', ABSTAINED: '전원 기권' });

const U = (x) => x.account.uuid;
// uuid → 닉네임 (사람·봇 둘 다 account에 있음)
const nickOf = (t, uuid) => [...t.bots, ...t.humans].find((x) => U(x) === uuid).account.nickname;

// 자동 구성대로 직업 고정: 사람 시민, 둘째 봇 광대, 그다음 봇부터 의사(6명~)·경비원(8명~)·마녀사냥꾼(10명), 나머지 시민
function rolesFor(n) {
    const special = ['JOKER', ...(n >= 6 ? ['DOCTOR'] : []), ...(n >= 8 ? ['GUARD'] : []), ...(n >= 10 ? ['WITCH_HUNTER'] : [])];
    return ({ humans, bots }) => {
        const out = {};
        for (const h of humans) out[U(h)] = 'CITIZEN';
        bots.forEach((b, i) => { out[U(b)] = special[i - 1] ?? 'CITIZEN'; });
        return out;
    };
}

// n명 판 (사람 1 + 봇 n-1) 차리고 직업이 정한 대로 됐는지 한 번 확인 (서버 예약이 가끔 못 맞음)
async function openTable(table, user, n, settings = {}) {
    const roles = rolesFor(n);
    const t = await table.setup({ humans: [user], bots: n - 1, settings, roles });
    const want = roles({ humans: t.humans, bots: t.bots });
    const s = await t.state();
    for (const p of s.players) expect(p.role, `${p.nickname} 직업`).toBe(want[p.uuid]);
    return t;
}

// 봇 낮 표 (답이 ok여야 함)
async function castBots(t, plan, bots = t.bots) {
    for (const bot of bots) {
        if (!plan.has(U(bot))) continue;
        const r = await bot.request('cast_day_vote', { gameId: t.gameId, targetId: plan.get(U(bot)) });
        expect(r?.ok, `봇 낮 표 거절: ${r?.code}`).toBe(true);
    }
}

// 사람 표: 카드 메뉴 "투표하기" 또는 "기권" 단추 → 기권 단추가 잠기면 서버가 받은 것 → 받은 시각
async function castHuman(t, page, target) {
    if (target === null) {
        const abstain = page.getByRole('button', { name: '기권' });
        await abstain.click();
        await expect(abstain).toBeDisabled();
    } else {
        await L.voteUi(page, nickOf(t, target));
    }
    return Date.now();
}

// 봇이 받은 알림 한 줄 기다림 → { event, payload, at(받은 시각) }
async function eventRow(bot, event, { since, match = () => true, timeout = 15000 }) {
    let row = null;
    await expect.poll(() => {
        row = bot.events.find((r) => r.event === event && r.at >= since && match(r.payload)) ?? null;
        return row !== null;
    }, { timeout, message: `${event} 알림 기다림` }).toBe(true);
    return row;
}

// 토론은 손잡이로 넘김(앞 단계 빨리) → 투표 열림, 산 사람 화면에 기권 단추까지 → { since(넘기기 전 시각), deadline(투표 마감 서버 값) }
async function openVote(t, { dayIndex = 1, alivePages = t.humans.map((h) => h.page) } = {}) {
    const since = Date.now();
    await t.advance();
    const row = await eventRow(t.bots[0], 'day_phase_changed', { since, match: (p) => p.dayIndex === dayIndex && p.dayPhase === 'DAY_VOTE' });
    for (const page of alivePages) await expect(page.getByRole('button', { name: '기권' })).toBeVisible();
    return { since, deadline: row.payload.dayPhaseDeadline };
}

// 투표 현황 창 열기 (밤 안내 같은 연출 창이 덮으면 닫고 다시)
async function openStatus(page) {
    const dialog = page.getByRole('dialog', { name: '투표 현황' });
    await expect(async () => {
        if (!(await dialog.isVisible())) {
            await ui.closeOverlays(page);
            await page.getByRole('button', { name: '투표 현황 열기' }).click({ timeout: 2000 });
        }
        await expect(dialog).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 20000 });
    return dialog;
}

// 현황 창 결과 글이 읽힘·재판 대상 (재판이면 target 이름, 아니면 없음), abstain 주면 기권 칸 수도 → 창 닫음
async function expectStatus(page, outcome, { abstain, target } = {}) {
    const status = await openStatus(page);
    const out = status.getByTestId('vote-status-outcome');
    await expect(out).toHaveText(OUTCOME_LABEL[outcome]);
    await expectReadable(out);
    if (outcome !== 'TRIBUNAL') await expect(status.getByTestId('vote-status-tribunal-target')).toHaveText('없음');
    if (target !== undefined) await expect(status.getByTestId('vote-status-tribunal-target')).toHaveText(target);
    if (abstain !== undefined) await expect(status.getByTestId('vote-status-public-abstain-count')).toHaveText(String(abstain));
    await status.getByRole('button', { name: '투표 현황 닫기' }).click();
    await expect(status).toBeHidden();
}

// 재판 없이 밤: "밤이 되었습니다" 창 → 재판 창 없음 → 현황 창 결과 글
async function expectNight(page, outcome, opts = {}) {
    await L.closeNotice(page, '밤이 되었습니다');
    await expect(page.getByRole('dialog', { name: '재판' })).toHaveCount(0);
    await expectStatus(page, outcome, opts);
}

// 재판으로 감: 재판 창이 뜨고 피고 이름이 보임 (재판 중엔 판 화면이 잠겨 현황 창은 못 엶)
async function expectTribunal(page, nickname) {
    const dialog = page.getByRole('dialog', { name: '재판' });
    await expect(dialog).toBeVisible({ timeout: 15000 });
    await expect(dialog).toContainText(nickname);
    await expectReadable(dialog.getByText(nickname).first());
}

// ── 시간 규칙 확인 (손잡이 안 씀) ──

// 당김 표시 글 (화면 selectInGameTimebarStatusMessage.js)
const SETTLE_LABEL = '[5초 뒤 마감]';
// 진짜 시간 허용 폭 ±1.5초 (시험_계획 3-5, 늘려서 덮지 않음)
const SLACK_MS = 1500;

// 그 날 낮 당김 알림이 한 번도 안 왔는지
const settleCount = (t, since, dayIndex = 1) => t.bots[0].events
    .filter((r) => r.event === 'phase_settle_started' && r.at >= since && r.payload.phase === 'DAY' && r.payload.dayIndex === dayIndex).length;

// 아직 안 찬 상태 확인: ms 동안 진짜로 기다린 뒤에도 당김 알림·"[5초 뒤 마감]" 없고 투표 그대로
async function expectStillOpen(t, page, { since, ms, dayIndex = 1 }) {
    await sleep(ms);
    expect(settleCount(t, since, dayIndex), '당김 알림 수').toBe(0);
    await expect(page.getByText(SETTLE_LABEL)).toHaveCount(0);
    const s = await t.state();
    expect(`${s.phase}/${s.dayPhase}`).toBe('DAY/DAY_VOTE');
}

// 다 안 찬 채 원래 마감에 판정: 당김 알림·표시 없이 투표 마감(±1.5초)에 판정 → 판정 알림 값
async function expectResolvedAtDeadline(t, { since, deadline, dayIndex = 1 }) {
    const row = await eventRow(t.bots[0], 'day_vote_resolved', { since, match: (p) => p.dayIndex === dayIndex, timeout: Math.max(0, deadline - Date.now()) + 15000 });
    expect(Math.abs(row.at - deadline), `마감과 ${row.at - deadline}ms 차이`).toBeLessThanOrEqual(SLACK_MS);
    expect(settleCount(t, since, dayIndex), '당김 알림 수').toBe(0);
    return row.payload;
}

// 투표 30초를 손잡이 없이 끝까지 기다림 → 마감(±1.5초)에 판정, 그 사이 당김 없음
async function waitDeadline(t, page, { since, deadline }) {
    await expectStillOpen(t, page, { since, ms: 6000 });
    return expectResolvedAtDeadline(t, { since, deadline });
}

// A03-E-266~271: 5·7·10명 × (몰표 재판 / 1표 나머지 안 냄 → 기권 많음)
// 몰표: X 빼고 전원 X를 찍고 X만 안 냄 → 다 안 차서 마감까지 감 / 1표: 사람만 X, 봇은 아무도 안 냄
[5, 7, 10].forEach((n, i) => {
    const idAll = `A03-E-${String(266 + i * 2).padStart(3, '0')}`;
    const idOne = `A03-E-${String(267 + i * 2).padStart(3, '0')}`;

    test(`${idAll} PC ${n}명 판 투표 30초 몰표(X만 안 냄) → 30초 끝에 재판 창 @game @realtime`, async ({ user, table }) => {
        test.setTimeout(180_000);
        const t = await openTable(table, user, n);
        const X = U(t.bots[2]);
        await L.toDay(t);
        const { since, deadline } = await openVote(t);
        await castBots(t, new Map(t.bots.filter((b) => U(b) !== X).map((b) => [U(b), X])));
        await castHuman(t, user.page, X);
        const resolved = await waitDeadline(t, user.page, { since, deadline });
        expect(resolved.outcome).toBe('TRIBUNAL');
        await expectTribunal(user.page, nickOf(t, X));
    });

    test(`${idOne} PC ${n}명 판 투표 30초 사람만 1표·봇 전원 안 냄 → 30초 끝에 기권 많음 밤 @game @realtime`, async ({ user, table }) => {
        test.setTimeout(180_000);
        const t = await openTable(table, user, n);
        const X = U(t.bots[2]);
        await L.toDay(t);
        const { since, deadline } = await openVote(t);
        await castHuman(t, user.page, X);
        const resolved = await waitDeadline(t, user.page, { since, deadline });
        expect(resolved.outcome).toBe('ABSTAIN_MAJORITY');
        await expectNight(user.page, 'ABSTAIN_MAJORITY', { abstain: n - 1 });
    });
});

test('A03-E-278 PC 6명 판 사람이 끝까지 안 냄 → 사람 표는 기권 칸에 @game @realtime', async ({ user, table }) => {
    test.setTimeout(180_000);
    const t = await openTable(table, user, 6);
    // 봇만: X 3(봇1·봇3·봇4)·기권 2(봇0·봇2=X) → 사람이 기권으로 셈이면 3:3이라 재판 없음 (안 세면 3:2로 재판 → 갈림)
    const [b0, b1, X, b3, b4] = t.bots.map(U);
    await L.toDay(t);
    const { since, deadline } = await openVote(t);
    await castBots(t, new Map([[b1, X], [b3, X], [b4, X], [b0, null], [X, null]]));
    const resolved = await waitDeadline(t, user.page, { since, deadline });
    expect(resolved.outcome).toBe('ABSTAIN_MAJORITY');
    await expectNight(user.page, 'ABSTAIN_MAJORITY', { abstain: 3 });
});

test('A03-E-280 PC 5명 판 아무도 안 냄 → 30초 끝에 "전원 기권"·밤 @game @realtime @smoke', async ({ user, table }) => {
    test.setTimeout(180_000);
    const t = await openTable(table, user, 5);
    await L.toDay(t);
    const { since, deadline } = await openVote(t);
    const resolved = await waitDeadline(t, user.page, { since, deadline });
    expect(resolved.outcome).toBe('ABSTAINED');
    await expectNight(user.page, 'ABSTAINED', { abstain: 5 });
});
