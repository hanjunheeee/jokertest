'use strict';

// 모바일 낮 표 바꾸기 진짜 시간 시험: (X→Y · X→기권 · 기권→X) × (다 차기 전 · 5초 안), 결과는 마지막 표대로·5초 안 바꿔도 마감 안 늘어남
// 목록 A03-낮투표.md A03-E-086·088·090·092·094·096 (모바일 몫), 돌리지 않고 모임만: npx playwright test --list tests/mobile/a03-vote-change.spec.js
const { test, expect } = require('../../helpers/fixtures');
const { talk, startTalkGame, toDay, toVote } = require('./_talk');

// ── 이 파일 도우미 (공용으로 올릴 후보: 모바일 낮 투표 묶음) ──

// 자동 역할 구성 (광대 1, 6명부터 의사, 8명부터 경비원, 10명부터 마녀사냥꾼, 남는 자리 시민)
function autoRoles(n) {
    const list = ['JOKER'];
    if (n >= 6) list.push('DOCTOR');
    if (n >= 8) list.push('GUARD');
    if (n >= 10) list.push('WITCH_HUNTER');
    while (list.length < n) list.push('CITIZEN');
    return list;
}

// 봇 직업 차례: 시민 먼저·광대 마지막 → 봇 0·1(X·Y)은 늘 시민이라 재판·퇴장에도 판이 안 끝남
const BOT_ORDER = ['CITIZEN', 'WITCH_HUNTER', 'GUARD', 'DOCTOR', 'JOKER'];

// 직업 고정 계획: 사람은 받은 직업(기본 시민), 남은 직업을 봇에 → { uuid: 직업 }
function rolePlan(n, humanRoles = []) {
    return ({ humans, bots }) => {
        const pool = autoRoles(n);
        const out = {};
        humans.forEach((h, i) => {
            const role = humanRoles[i] ?? 'CITIZEN';
            if (!pool.includes(role)) throw new Error(`${n}명 자동 구성에 ${role} 자리 없음`);
            pool.splice(pool.indexOf(role), 1);
            out[h.account.uuid] = role;
        });
        pool.sort((a, b) => BOT_ORDER.indexOf(a) - BOT_ORDER.indexOf(b));
        bots.forEach((b, i) => { out[b.account.uuid] = pool[i]; });
        return out;
    };
}

// 서버가 정한 직업이 계획과 같은지 (예약이 가끔 못 맞음)
async function expectRoles(t, plan) {
    const want = plan({ humans: t.humans, bots: t.bots });
    const s = await t.state();
    expect(Object.fromEntries(s.players.map((p) => [p.uuid, p.role]))).toEqual(want);
}

// 판 차리고 제 1일 낮 투표까지 (역할 공개·토론은 이 시험이 보는 규칙이 아니라 손잡이로 빨리)
async function openVote(table, user, n, { humanRoles, settings } = {}) {
    const roles = rolePlan(n, humanRoles);
    const t = await startTalkGame(table, user, { bots: n - 1, roles, settings });
    await expectRoles(t, roles);
    await toDay(t, user.page);
    await toVote(t, user.page);
    return t;
}

// uuid → 닉네임
async function namesOf(t) {
    const s = await t.state();
    return new Map(s.players.map((p) => [p.uuid, p.nickname]));
}

const uuidOf = (who) => who.account.uuid;

const abstainButton = (page) => page.getByRole('button', { name: '기권' });

const sheetOf = (page) => page.locator('[data-ingame-player-card-menu]');

// 초상 띠 칸을 눌러 그 사람 카드 시트 열기
async function openSheet(page, nick) {
    await talk.slot(page, nick).click();
    const sheet = sheetOf(page);
    await expect(sheet).toHaveAttribute('aria-label', nick);
    return sheet;
}

// 사람 표: null이면 기권 단추, 아니면 그 사람 카드 '투표하기' → 기권 단추가 꺼지면 서버가 받은 것
async function castMine(page, target, names) {
    if (target === null) {
        await abstainButton(page).click();
    } else {
        const sheet = await openSheet(page, names.get(target));
        await sheet.getByRole('menuitem', { name: '투표하기' }).click();
        await expect(sheet).toBeHidden();
    }
    await expect(abstainButton(page)).toBeDisabled();
}

// 봇 표 (계획에 있는 봇만, 서버 답 ok까지)
async function castBots(t, plan, bots = t.bots) {
    for (const bot of bots) {
        if (!plan.has(uuidOf(bot))) continue;
        const reply = await bot.request('cast_day_vote', { gameId: t.gameId, targetId: plan.get(uuidOf(bot)) });
        expect(reply?.ok, `봇 낮 표 거절: ${reply?.code}`).toBe(true);
    }
}

// 투표 현황 창 열기 → 창
async function openStatus(page) {
    await page.getByRole('button', { name: '투표 현황 열기' }).click();
    const panel = page.getByRole('dialog', { name: '투표 현황' });
    await expect(panel).toBeVisible();
    return panel;
}

// 결과 값 → 화면 글 (결-투표·결-버그9 화면 문구)
const OUTCOME_TEXT = Object.freeze({
    TRIBUNAL: '재판 회부',
    TIE: '동점',
    ABSTAIN_MAJORITY: '기권이 많아 재판 없음',
    ABSTAINED: '전원 기권',
});

// 판정 뒤 화면: 현황 결과 글 + 재판이면 재판 창(피고 이름), 밤이면 밤 안내·재판 창 없음
async function expectOutcome(page, panel, kind, targetNick) {
    await expect(panel.getByTestId('vote-status-outcome')).toHaveText(OUTCOME_TEXT[kind], { timeout: 15_000 });
    const tribunal = page.locator('[data-ingame-tribunal-presentation]');
    if (kind === 'TRIBUNAL') {
        await expect(tribunal).toBeVisible();
        await expect(tribunal).toContainText(targetNick);
        return;
    }
    await expect(page.getByRole('dialog', { name: '단계 전환 안내' })).toContainText('밤이 되었습니다');
    await expect(tribunal).toHaveCount(0);
}

// 봇이 받은 사건 하나 + 받은 시각 (since 뒤 것만)
async function eventAt(bot, event, { since = 0, match = () => true, timeoutMs = 40_000 } = {}) {
    const payload = await bot.waitForEvent(event, { since, match, timeoutMs });
    const row = bot.events.find((r) => r.payload === payload);
    return { payload, at: row?.at ?? Date.now() };
}

// 다 찬 판정: 마지막 표 직전 시각(fullAt)부터 당김 알림 마감·판정 알림이 5초(±1.5) 뒤 → 판정 값
async function expectFiveSeconds(watcher, fullAt, day) {
    const settle = await eventAt(watcher, 'phase_settle_started', { since: fullAt, match: (p) => p.phase === 'DAY' && p.dayIndex === day });
    const resolved = await eventAt(watcher, 'day_vote_resolved', { since: fullAt, match: (p) => p.dayIndex === day });
    expect(settle.payload.deadline - fullAt).toBeGreaterThanOrEqual(3_500);
    expect(settle.payload.deadline - fullAt).toBeLessThanOrEqual(6_500);
    expect(resolved.at - fullAt).toBeGreaterThanOrEqual(3_500);
    expect(resolved.at - fullAt).toBeLessThanOrEqual(6_500);
    return resolved.payload;
}

// 사람 표 바꾸기 (이미 낸 뒤): 다른 사람이면 그 카드 '투표하기', 기권이면 낸 사람 카드 '투표취소'
async function changeMine(page, from, to, names) {
    if (to === null) {
        const sheet = await openSheet(page, names.get(from));
        await sheet.getByRole('menuitem', { name: '투표취소' }).click();
        await expect(sheet).toBeHidden();
        return;
    }
    const sheet = await openSheet(page, names.get(to));
    await sheet.getByRole('menuitem', { name: '투표하기' }).click();
    await expect(sheet).toBeHidden();
}

// ── 시험 ──

// 7명 판 봇 표 (사람 빼고): X→Y, Y→X, 봇2→X, 봇3→Y, 봇4·봇5 기권 → X 2·Y 2·기권 2
// 사람이 X면 X 3 → X 재판 / Y면 Y 3 → Y 재판 / 기권이면 기권 3 ≥ 최다 2 → 밤 (마지막 표에 따라 결과가 갈림)
function botPlan(t) {
    const [X, Y, b2, b3, b4, b5] = t.bots.map(uuidOf);
    return new Map([[X, Y], [Y, X], [b2, X], [b3, Y], [b4, null], [b5, null]]);
}

const CHANGES = [
    { label: 'X→Y', from: 'X', to: 'Y', outcome: 'TRIBUNAL', target: 'Y' },
    { label: 'X→기권', from: 'X', to: null, outcome: 'ABSTAIN_MAJORITY', target: null },
    { label: '기권→X', from: null, to: 'X', outcome: 'TRIBUNAL', target: 'X' },
];
const WHEN = [
    { label: '다 차기 전', inWindow: false },
    { label: '5초 안', inWindow: true },
];

CHANGES.forEach((change, i) => {
    WHEN.forEach((when, j) => {
        // 값 순서: (바꾸기 3) × (때 2) × (PC·모바일) → 모바일은 짝수 번호
        const no = 85 + (i * WHEN.length + j) * 2 + 1;
        const smoke = no === 86 ? ' @smoke' : '';
        const result = change.outcome === 'TRIBUNAL' ? `${change.target} 재판` : '기권 많음 밤';
        test(`A03-E-0${no} 모바일 7명 판 사람 ${change.label} ${when.label} → 마지막 표대로 ${result}${when.inWindow ? ', 마감 안 늘어남' : ''} @game @realtime${smoke}`, async ({ user, table }) => {
            const t = await openVote(table, user, 7);
            const names = await namesOf(t);
            const ids = { X: uuidOf(t.bots[0]), Y: uuidOf(t.bots[1]) };
            const from = change.from === null ? null : ids[change.from];
            const to = change.to === null ? null : ids[change.to];
            const plan = botPlan(t);
            const voters = t.bots;

            await castMine(user.page, from, names);
            let fullAt;
            if (!when.inWindow) {
                // 봇 반쯤 낸 사이에 바꾸고, 나머지 봇이 마지막 표
                await castBots(t, plan, voters.slice(0, 3));
                await changeMine(user.page, from, to, names);
                await castBots(t, plan, voters.slice(3, -1));
                fullAt = Date.now();
                await castBots(t, plan, voters.slice(-1));
            } else {
                await castBots(t, plan, voters.slice(0, -1));
                fullAt = Date.now();
                await castBots(t, plan, voters.slice(-1));
                // 다 찬 뒤 5초 안에 바꿈
                await expect(talk.phaseLine(user.page)).toContainText('5초 뒤 마감', { timeout: 4_000 });
                await changeMine(user.page, from, to, names);
            }
            const panel = await openStatus(user.page);
            // 판정은 처음 다 찬 때부터 5초(±1.5) — 5초 안에 바꿔도 안 늘어남
            const resolved = await expectFiveSeconds(t.bots[2], fullAt, 1);
            const settles = t.bots[2].events.filter((r) => r.event === 'phase_settle_started' && r.payload?.phase === 'DAY' && r.payload?.dayIndex === 1);
            expect(settles, '당김 알림은 한 번').toHaveLength(1);
            expect(resolved.outcome).toBe(change.outcome);
            await expectOutcome(user.page, panel, change.outcome, change.target ? names.get(ids[change.target]) : undefined);
        });
    });
});
