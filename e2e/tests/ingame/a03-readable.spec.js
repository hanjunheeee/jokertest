'use strict';

// 낮 투표 글이 사람 눈에 읽히는지 브라우저 시험 (PC) — 현황 결과 글 4가지·"[5초 뒤 마감]"·재판 대상 이름·"집계 전"을 expectReadable(대비·안 가려짐·화면 안)로 봄
// 목록 A03-낮투표.md 번호 A03-E-210~222 중 PC 몫(210·212·214·216·218·220·222)
const { test, expect, ui } = require('../../helpers/fixtures');
const { customRoleSettings } = require('../../helpers/game');
const { expectReadable } = require('../../helpers/visible');
const L = require('./a-day/_lib');

const U = (x) => x.account.uuid;
const nickOf = (t, uuid) => [...t.bots, ...t.humans].find((x) => U(x) === uuid).account.nickname;

// 결과 값 → 현황 창 글 (화면 InGameVoteStatusContent.jsx 글)
const OUTCOME_LABEL = Object.freeze({ TRIBUNAL: '재판 회부', TIE: '동점', ABSTAIN_MAJORITY: '기권이 많아 재판 없음', ABSTAINED: '전원 기권' });

// 직업 전부 정함: 사람 시민, 첫 봇 광대, 나머지 시민 (직접 구성 광대 1)
function rolesFor() {
    return ({ humans, bots }) => {
        const out = { [U(humans[0])]: 'CITIZEN' };
        bots.forEach((b, i) => { out[U(b)] = i === 0 ? 'JOKER' : 'CITIZEN'; });
        return out;
    };
}

// n명 판 (사람 1 + 봇 n-1) 차리고 직업이 정한 대로 됐는지 한 번 확인 (서버 예약이 가끔 못 맞음)
async function openTable(table, user, n) {
    const roles = rolesFor();
    const t = await table.setup({ humans: [user], bots: n - 1, settings: customRoleSettings({ JOKER: 1 }), roles });
    const want = roles({ humans: t.humans, bots: t.bots });
    const s = await t.state();
    expect(s.players).toHaveLength(n);
    for (const p of s.players) expect(p.role, `${p.nickname} 직업`).toBe(want[p.uuid]);
    return t;
}

// 봇이 받은 알림 한 줄 기다림 → { event, payload, at(받은 시각) }
async function eventRow(bot, event, { since = 0, match = () => true, timeout = 20000 } = {}) {
    let row = null;
    await expect.poll(() => {
        row = bot.events.find((r) => r.event === event && r.at >= since && match(r.payload)) ?? null;
        return row !== null;
    }, { timeout, message: `${event} 알림 기다림` }).toBe(true);
    return row;
}

// 단계 전환 안내 창 중 text가 든 창까지 (그 앞 다른 안내·밤 차례 안내·알림 창은 닫음), 그 창도 닫음
async function reachNotice(page, text, { timeout = 40000 } = {}) {
    const notice = page.getByRole('dialog', { name: '단계 전환 안내', exact: true });
    await expect.poll(async () => {
        await ui.closeOverlays(page, { names: ['밤 역할 안내', '알림'], keepWatching: false, rounds: 1 });
        if (!(await notice.isVisible().catch(() => false))) return false;
        const shown = await notice.innerText().catch(() => '');
        await notice.getByRole('button', { name: '확인' }).click({ timeout: 2000 }).catch(() => {});
        return shown.includes(text);
    }, { timeout, intervals: [300], message: `"${text}" 안내 창` }).toBe(true);
}

// 투표 현황 창 열기 (연출 창이 덮으면 닫고 다시)
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

// 사람 표: 카드 "투표하기" 또는 "기권" → 기권 단추가 잠기면 서버가 받은 것
async function humanVote(t, page, target) {
    if (target === null) {
        const abstain = page.getByRole('button', { name: '기권' });
        await abstain.click();
        await expect(abstain).toBeDisabled();
    } else {
        await L.voteUi(page, nickOf(t, target));
    }
}

// 투표 열고 봇 표 → 사람이 마지막 표 → 다 참 → 5초 뒤 판정(손잡이 안 씀) → 판정 알림
async function voteAll(t, page, botPairs, mine) {
    await L.toDay(t);
    await L.toVote(t);
    const since = Date.now();
    await L.botsVote(t, botPairs);
    await humanVote(t, page, mine);
    return eventRow(t.bots[0], 'day_vote_resolved', { since, match: (p) => p.dayIndex === 1 });
}

// 재판이면 아무도 안 내 무죄로 밤까지 (재판 중엔 판 화면이 잠겨 현황 창을 못 엶 → 밤에 엶), 그다음 밤 안내 닫음
async function toNightAfterResult(t, page, resolved) {
    if (resolved.payload.outcome === 'TRIBUNAL') {
        await expect(page.getByRole('dialog', { name: '재판' })).toBeVisible({ timeout: 15000 });
        await L.resolveTribunal(t);
    }
    await reachNotice(page, '밤이 되었습니다');
}

// 결과 4 — 목록 E-001 줄 순서(몰표·두 명 동점·1표 나머지 기권·전원 기권), 봇 자리 0 광대 · 1 X · 2 Y · 나머지
const RESULTS = [
    {
        no: 210, n: 6, name: '몰표', outcome: 'TRIBUNAL',
        // 나머지 전원 X, X는 Y → X 5·Y 1
        plan: (t) => ({ pairs: t.bots.map((b, i) => [b, i === 1 ? U(t.bots[2]) : U(t.bots[1])]), mine: U(t.bots[1]) }),
    },
    {
        no: 212, n: 5, name: '두 명 동점', outcome: 'TIE',
        // X 2(사람·광대)·Y 2(X·셋째 봇)·기권 1(Y) → 동점
        plan: (t) => ({
            pairs: [[t.bots[0], U(t.bots[1])], [t.bots[1], U(t.bots[2])], [t.bots[2], null], [t.bots[3], U(t.bots[2])]],
            mine: U(t.bots[1]),
        }),
    },
    {
        no: 214, n: 7, name: '1표 나머지 기권', outcome: 'ABSTAIN_MAJORITY',
        // 사람 혼자 X, 봇 6 기권 → 1 ≤ 6 → 기권이 많아 재판 없음
        plan: (t) => ({ pairs: t.bots.map((b) => [b, null]), mine: U(t.bots[1]) }),
    },
    {
        no: 216, n: 5, name: '전원 기권', outcome: 'ABSTAINED',
        plan: (t) => ({ pairs: t.bots.map((b) => [b, null]), mine: null }),
    },
];

RESULTS.forEach(({ no, n, name, outcome, plan }) => {
    test(`A03-E-${no} PC ${n}명 판 ${name} → 현황 결과 글 "${OUTCOME_LABEL[outcome]}"이 읽힘 @game`, async ({ user, table }) => {
        const t = await openTable(table, user, n);
        const page = user.page;
        const { pairs, mine } = plan(t);
        const resolved = await voteAll(t, page, pairs, mine);
        expect(resolved.payload.outcome).toBe(outcome);
        await toNightAfterResult(t, page, resolved);
        const status = await openStatus(page);
        const out = status.getByTestId('vote-status-outcome');
        await expect(out).toHaveText(OUTCOME_LABEL[outcome]);
        await expectReadable(out);
    });
});

test('A03-E-218 PC 6명 판 다 내면 시간 줄 "[5초 뒤 마감]"이 읽힘 @game @realtime', async ({ user, table }) => {
    const t = await openTable(table, user, 6);
    const page = user.page;
    await L.toDay(t);
    await L.toVote(t);
    const since = Date.now();
    await L.botsVote(t, t.bots.map((b) => [b, null]));
    // 사람이 마지막 표 → 다 참 → 5초 안에 글이 읽혀야 함 (손잡이 안 씀)
    await humanVote(t, page, null);
    await eventRow(t.bots[0], 'phase_settle_started', { since, match: (p) => p.phase === 'DAY' && p.dayIndex === 1, timeout: 5000 });
    await expectReadable(page.getByText('[5초 뒤 마감]', { exact: true }), { timeout: 4000 });
});

test('A03-E-220 PC 7명 판 현황 재판 대상 닉네임이 읽힘 @game', async ({ user, table }) => {
    const t = await openTable(table, user, 7);
    const page = user.page;
    const X = U(t.bots[1]);
    // 나머지 전원 X, X는 Y → X 재판
    const pairs = t.bots.map((b, i) => [b, i === 1 ? U(t.bots[2]) : X]);
    const resolved = await voteAll(t, page, pairs, X);
    expect(resolved.payload.outcome).toBe('TRIBUNAL');
    expect(resolved.payload.tribunalTargetUuid).toBe(X);
    await toNightAfterResult(t, page, resolved);
    const status = await openStatus(page);
    const target = status.getByTestId('vote-status-tribunal-target');
    await expect(target).toHaveText(nickOf(t, X));
    await expectReadable(target);
});

test('A03-E-222 PC 5명 판 판정 전 현황 "집계 전"이 읽힘 @game @smoke', async ({ user, table }) => {
    const t = await openTable(table, user, 5);
    const page = user.page;
    await L.toDay(t);
    await L.toVote(t);
    const status = await openStatus(page);
    const unresolved = status.getByTestId('vote-status-unresolved');
    await expect(unresolved).toHaveText('집계 전');
    await expectReadable(unresolved);
});
