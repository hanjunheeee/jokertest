'use strict';

// [받은 버그 9] 기권이 많으면 재판 없음 브라우저 시험 (PC) — 최다 득표가 기권보다 많아야 재판, 같거나 적으면 재판 창 없이 밤
// 목록 A03-낮투표.md 번호 A03-E-049·051·052·053~062 — 다 낸 뒤 5초는 손잡이 없이 진짜로 기다림, 결과 이유 값 ABSTAIN_MAJORITY
const { test, expect, ui } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
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

// 표 모양 → 표 목록 (null = 기권) → 예: ([[X, 2], [Y, 1]], 2) → [X, X, Y, null, null]
const ballots = (targets, abstain = 0) => [...targets.flatMap(([u, k]) => Array(k).fill(u)), ...Array(abstain).fill(null)];

// 표 목록을 사람마다 나눔 (자기 자신 찍는 표는 안 줌), fixed는 미리 정한 사람 표 → Map(uuid → 대상)
function assignBallots(voters, list, fixed = {}) {
    const left = [...list];
    const out = new Map();
    for (const [u, b] of Object.entries(fixed)) {
        const at = left.indexOf(b);
        if (at < 0) throw new Error('정한 표가 표 모양에 없음');
        left.splice(at, 1);
        out.set(u, b);
    }
    const rest = voters.filter((u) => !out.has(u));
    if (rest.length !== left.length) throw new Error(`표 수(${left.length})와 낼 사람 수(${rest.length})가 다름`);
    const place = (i) => {
        if (i === rest.length) return true;
        for (let k = 0; k < left.length; k += 1) {
            const b = left[k];
            if (b === rest[i]) continue;
            left.splice(k, 1);
            out.set(rest[i], b);
            if (place(i + 1)) return true;
            left.splice(k, 0, b);
            out.delete(rest[i]);
        }
        return false;
    };
    if (!place(0)) throw new Error('표 모양을 못 나눔 (자기 자신 표만 남음)');
    return out;
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

// 토론은 손잡이로 넘김(앞 단계 빨리) → 투표 열림, 사람 화면에 기권 단추까지
async function openVote(t, { dayIndex = 1 } = {}) {
    const since = Date.now();
    await t.advance();
    await eventRow(t.bots[0], 'day_phase_changed', { since, match: (p) => p.dayIndex === dayIndex && p.dayPhase === 'DAY_VOTE' });
    for (const h of t.humans) await expect(h.page.getByRole('button', { name: '기권' })).toBeVisible();
    return since;
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

// 재판 없이 밤: "밤이 되었습니다" 창 → 재판 창 없음 → 현황 창 결과 글이 읽힘·재판 대상 없음
async function expectNight(page, outcome, { abstain } = {}) {
    await L.closeNotice(page, '밤이 되었습니다');
    await expect(page.getByRole('dialog', { name: '재판' })).toHaveCount(0);
    const status = await openStatus(page);
    const out = status.getByTestId('vote-status-outcome');
    await expect(out).toHaveText(OUTCOME_LABEL[outcome]);
    await expectReadable(out);
    await expect(status.getByTestId('vote-status-tribunal-target')).toHaveText('없음');
    if (abstain !== undefined) await expect(status.getByTestId('vote-status-public-abstain-count')).toHaveText(String(abstain));
}

// 재판으로 감: 재판 창이 뜨고 피고 이름이 보임 (재판 중엔 판 화면이 잠겨 현황 창은 못 엶)
async function expectTribunal(page, nickname) {
    const dialog = page.getByRole('dialog', { name: '재판' });
    await expect(dialog).toBeVisible({ timeout: 15000 });
    await expect(dialog).toContainText(nickname);
    await expectReadable(dialog.getByText(nickname).first());
}


// 판 하나 돌림: 표 모양대로 봇이 먼저, 사람(늘 X)이 마지막 → 결과 확인
async function playShape({ user, table, n, targets, abstain, outcome }) {
    const t = await openTable(table, user, n);
    const me = U(user);
    const X = U(t.bots[2]);
    const Y = U(t.bots[3]);
    const list = ballots(targets({ X, Y }), abstain);
    const plan = assignBallots([me, ...t.bots.map(U)], list, { [me]: X });

    await L.toDay(t);
    const since = await openVote(t);
    await castBots(t, plan);
    await castHuman(t, user.page, X);
    const resolved = await eventRow(t.bots[0], 'day_vote_resolved', { since, match: (p) => p.dayIndex === 1 });
    expect(resolved.payload.outcome).toBe(outcome);
    // 다 냈으니 판정 뒤엔 피고 없음·밤 (재판이면 피고 X)
    if (outcome === 'TRIBUNAL') await expectTribunal(user.page, nickOf(t, X));
    else await expectNight(user.page, outcome, { abstain });
}

test('A03-E-049 [버그 9] PC 7명 판 1표 6기권 → 재판 창 안 뜨고 밤, 현황 "기권이 많아 재판 없음" @game @smoke', async ({ user, table }) => {
    await playShape({ user, table, n: 7, targets: ({ X }) => [[X, 1]], abstain: 6, outcome: 'ABSTAIN_MAJORITY' });
});

test('A03-E-051 [버그 9] PC 6명 판 3표 3기권 (사람+봇 2가 X) → 재판 없이 밤 @game', async ({ user, table }) => {
    await playShape({ user, table, n: 6, targets: ({ X }) => [[X, 3]], abstain: 3, outcome: 'ABSTAIN_MAJORITY' });
});

test('A03-E-052 [버그 9] PC 7명 판 4표 3기권 → 재판 창 뜸 @game', async ({ user, table }) => {
    await playShape({ user, table, n: 7, targets: ({ X }) => [[X, 4]], abstain: 3, outcome: 'TRIBUNAL' });
});

// 기권 경계 표 모양 (B-001~036 ④ 최다 = 기권 / ⑤ 최다 = 기권+1)
// 인원 → [X 표, Y 표, 기권]
const EQUAL_SHAPE = Object.freeze({ 5: [2, 1, 2], 6: [3, 0, 3], 8: [4, 0, 4], 9: [4, 1, 4], 10: [5, 0, 5] });
const PLUS_ONE_SHAPE = Object.freeze({ 5: [3, 0, 2], 6: [3, 1, 2], 8: [4, 1, 3], 9: [5, 0, 4], 10: [5, 1, 4] });
const shapeTargets = ([x, y]) => ({ X, Y }) => (y > 0 ? [[X, x], [Y, y]] : [[X, x]]);

// A03-E-053~062: 인원 5·6·8·9·10 × (최다 = 기권 → 밤 / 최다 = 기권+1 → 재판 창)
[5, 6, 8, 9, 10].forEach((n, i) => {
    const eq = EQUAL_SHAPE[n];
    const plus = PLUS_ONE_SHAPE[n];
    const idEq = `A03-E-${String(53 + i * 2).padStart(3, '0')}`;
    const idPlus = `A03-E-${String(54 + i * 2).padStart(3, '0')}`;
    const text = ([x, y, a]) => `X ${x}${y > 0 ? `·Y ${y}` : ''}·기권 ${a}`;

    test(`${idEq} [버그 9] PC ${n}명 판 최다 = 기권 (${text(eq)}) → 재판 없이 밤 @game`, async ({ user, table }) => {
        await playShape({ user, table, n, targets: shapeTargets(eq), abstain: eq[2], outcome: 'ABSTAIN_MAJORITY' });
    });

    test(`${idPlus} [버그 9] PC ${n}명 판 최다 = 기권+1 (${text(plus)}) → 재판 창 @game`, async ({ user, table }) => {
        await playShape({ user, table, n, targets: shapeTargets(plus), abstain: plus[2], outcome: 'TRIBUNAL' });
    });
});
