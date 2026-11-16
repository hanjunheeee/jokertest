'use strict';

// 낮 표 바꾸기 브라우저 시험 (PC, 7명 판) — X→Y·X→기권·기권→X를 다 차기 전/5초 안에 바꿈 → 결과가 마지막 표대로, 5초 안 바꾸기는 마감이 안 늘어남
// 목록 A03-낮투표.md 번호 A03-E-085~095 홀수(PC 몫) — 5초 규칙을 보는 케이스라 손잡이 없이 진짜로 기다림(@realtime)
const { test, expect, ui } = require('../../helpers/fixtures');
const { customRoleSettings } = require('../../helpers/game');
const { expectReadable } = require('../../helpers/visible');
const L = require('./a-day/_lib');

const U = (x) => x.account.uuid;
const nickOf = (t, uuid) => [...t.bots, ...t.humans].find((x) => U(x) === uuid).account.nickname;

// 직업 전부 정함: 사람 시민, 첫 봇 광대, 나머지 시민 (직접 구성 광대 1)
function rolesFor() {
    return ({ humans, bots }) => {
        const out = { [U(humans[0])]: 'CITIZEN' };
        bots.forEach((b, i) => { out[U(b)] = i === 0 ? 'JOKER' : 'CITIZEN'; });
        return out;
    };
}

// 7명 판 (사람 1 + 봇 6) 차리고 직업이 정한 대로 됐는지 한 번 확인 (서버 예약이 가끔 못 맞음)
async function openTable(table, user) {
    const roles = rolesFor();
    const t = await table.setup({ humans: [user], bots: 6, settings: customRoleSettings({ JOKER: 1 }), roles });
    const want = roles({ humans: t.humans, bots: t.bots });
    const s = await t.state();
    expect(s.players).toHaveLength(7);
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

// 카드 눌러 메뉴 항목 이름 읽고 Esc로 닫음
async function cardMenuNames(page, nickname) {
    await L.card(page, nickname).click();
    const menu = page.getByRole('menu', { name: '플레이어 행동' });
    await expect(menu).toBeVisible();
    const names = await menu.locator('[role="menuitem"]').evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')));
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    return names;
}

// 사람 표 내기 → 서버가 받은 표시까지 기다림 (사람 대상이면 그 카드에 "투표취소", 기권이면 기권 단추 꺼짐/찍었던 카드가 "투표하기"로)
async function humanVote(t, page, target, { from = null } = {}) {
    if (target === null) {
        if (from === null) {
            const abstain = page.getByRole('button', { name: '기권' });
            await abstain.click();
            await expect(abstain).toBeDisabled();
        } else {
            // 한 번 낸 뒤엔 기권 단추가 꺼져 있음 → 찍은 카드의 "투표취소"가 기권으로 바꾸는 길
            await L.cardAction(page, nickOf(t, from), '투표취소');
            await expect(async () => {
                expect(await cardMenuNames(page, nickOf(t, from))).toContain('투표하기');
            }).toPass({ timeout: 5000 });
        }
        return;
    }
    await L.cardAction(page, nickOf(t, target), '투표하기');
    await expect(async () => {
        expect(await cardMenuNames(page, nickOf(t, target))).toContain('투표취소');
    }).toPass({ timeout: 5000 });
}

// 봇 표: 사람 표가 결과를 가르게 짠 모양 (사람 빼고 X 2·Y 2·Z 1·기권 1)
// 사람이 X → X 3 > 기권 1 → X 재판 / Y → Y 재판 / 기권 → 최다 2 ≤ 기권 2 → 재판 없이 밤
function botPlan(t) {
    // 봇 자리: 0 광대 · 1 X · 2 Y · 3 A · 4 B · 5 Z
    const [, X, Y, , , Z] = t.bots.map(U);
    return {
        X, Y,
        pairs: [
            [t.bots[0], Z], // 광대 → Z
            [t.bots[1], Y], // X → Y
            [t.bots[2], X], // Y → X
            [t.bots[3], X], // A → X
            [t.bots[4], Y], // B → Y
            [t.bots[5], null], // Z 기권
        ],
    };
}

// 결과 확인: 봇이 받은 판정 알림 + 사람 화면 (재판이면 재판 창 피고 이름, 밤이면 밤 안내 뒤 현황 창 재판 대상 "없음")
async function expectOutcome(t, page, resolved, finalTarget) {
    if (finalTarget === null) {
        expect(resolved.payload.outcome).not.toBe('TRIBUNAL');
        expect(resolved.payload.tribunalTargetUuid).toBeNull();
        await L.closeNotice(page, '밤이 되었습니다');
        await expect(page.getByRole('dialog', { name: '재판' })).toHaveCount(0);
        await page.getByRole('button', { name: '투표 현황 열기' }).click();
        const target = page.getByRole('dialog', { name: '투표 현황' }).getByTestId('vote-status-tribunal-target');
        await expect(target).toHaveText('없음');
        await expectReadable(target);
    } else {
        expect(resolved.payload.outcome).toBe('TRIBUNAL');
        expect(resolved.payload.tribunalTargetUuid).toBe(finalTarget);
        const dialog = page.getByRole('dialog', { name: '재판' });
        await expect(dialog).toBeVisible({ timeout: 15000 });
        await expect(dialog).toContainText(nickOf(t, finalTarget));
        await expectReadable(dialog.getByText(nickOf(t, finalTarget)).first());
    }
}

// 바꾸기 3 × 때 2 — 목록 줄 순서((X→Y · X→기권 · 기권→X) × (다 차기 전 · 5초 안))대로, PC는 홀수 번호
const CHANGES = [
    { name: 'X→Y', first: 'X', last: 'Y' },
    { name: 'X→기권', first: 'X', last: null },
    { name: '기권→X', first: null, last: 'X' },
];
const WHENS = [
    { name: '다 차기 전', key: 'before' },
    { name: '5초 안', key: 'during' },
];

CHANGES.forEach((change, ci) => WHENS.forEach((when, wi) => {
    const id = `A03-E-${String(85 + (ci * WHENS.length + wi) * 2).padStart(3, '0')}`;
    const smoke = id === 'A03-E-085' ? ' @smoke' : '';
    const expectText = change.last === null ? '재판 없이 밤' : `${change.last} 재판`;
    test(`${id} PC 7명 판 표 바꾸기 ${change.name} (${when.name}) → 마지막 표대로 ${expectText}${when.key === 'during' ? ', 마감 안 늘어남' : ''} @game @realtime${smoke}`, async ({ user, table }) => {
        const t = await openTable(table, user);
        const page = user.page;
        const plan = botPlan(t);
        const pick = (k) => (k === null ? null : plan[k]);
        const first = pick(change.first);
        const last = pick(change.last);

        await L.toDay(t);
        // 토론은 앞 단계라 손잡이로 넘김 (투표 단계 5초는 안 넘김)
        await L.toVote(t);
        const since = Date.now();

        if (when.key === 'before') {
            // 사람이 먼저 내고 바꿈 → 봇이 마지막에 내서 다 참
            await humanVote(t, page, first);
            await humanVote(t, page, last, { from: first });
            await L.botsVote(t, plan.pairs);
        } else {
            // 봇이 먼저 다 냄 → 사람 첫 표로 다 참("[5초 뒤 마감]") → 5초 안에 바꿈
            await L.botsVote(t, plan.pairs);
            await humanVote(t, page, first);
            await eventRow(t.bots[0], 'phase_settle_started', { since, match: (p) => p.phase === 'DAY' && p.dayIndex === 1, timeout: 5000 });
            await humanVote(t, page, last, { from: first });
            expect((await t.state()).dayPhase, '바꾸기를 5초 안에 마침').toBe('DAY_VOTE');
        }

        const settle = await eventRow(t.bots[0], 'phase_settle_started', { since, match: (p) => p.phase === 'DAY' && p.dayIndex === 1 });
        const resolved = await eventRow(t.bots[0], 'day_vote_resolved', { since, match: (p) => p.dayIndex === 1, timeout: 15000 });
        // 다 찬 뒤 한 번만 당기고 5초(±1.5) 뒤 판정 — 5초 안 바꾸기가 마감을 다시 늘리지 않음
        expect(t.bots[0].events.filter((r) => r.event === 'phase_settle_started' && r.at >= since)).toHaveLength(1);
        expect(Math.abs(resolved.at - settle.at - 5000), `당김 뒤 ${resolved.at - settle.at}ms 만에 판정`).toBeLessThanOrEqual(1500);
        await expectOutcome(t, page, resolved, last);
        // 남은 화면 정리용 연출 창 닫기 (다음 시험에 영향 없음)
        await ui.closeOverlays(page).catch(() => {});
    });
}));
