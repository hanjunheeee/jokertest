'use strict';

// 모바일 투표 시간 끝 판정 진짜 시간 시험(투표 30초): 다 안 차면 마감에 판정하고 안 낸 표는 기권으로 셈
// 목록 A03-낮투표.md A03-E-272~277·279 (모바일 몫), 돌리지 않고 모임만: npx playwright test --list tests/mobile/a03-deadline-fill.spec.js
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

// 투표 마감 시각 (투표 단계 알림에 실린 값)
async function voteDeadline(bot, day) {
    const p = await bot.waitForEvent('day_phase_changed', { match: (x) => x.dayPhase === 'DAY_VOTE' && x.dayIndex === day });
    return p.dayPhaseDeadline;
}

// 마감 판정: 당김 알림 없이 원래 마감(±1.5초)에 판정 → 판정 값
async function expectAtDeadline(watcher, deadline, day) {
    const resolved = await eventAt(watcher, 'day_vote_resolved', {
        match: (p) => p.dayIndex === day, timeoutMs: Math.max(0, deadline - Date.now()) + 20_000,
    });
    expect(Math.abs(resolved.at - deadline)).toBeLessThanOrEqual(1_500);
    const pulled = watcher.events.filter((r) => r.event === 'phase_settle_started' && r.payload?.phase === 'DAY' && r.payload?.dayIndex === day);
    expect(pulled, '마감 당김 알림이 오면 안 됨').toHaveLength(0);
    return resolved.payload;
}

// ── 시험 ──

// 5·7·10명 판 × (몰표 재판: X 자신만 안 냄 / 1표 나머지 안 냄: 기권 많음) → 30초 끝에 판정
const SHAPES = [
    { label: '몰표(X만 안 냄)', outcome: 'TRIBUNAL' },
    { label: '1표·나머지 안 냄', outcome: 'ABSTAIN_MAJORITY' },
];

[5, 7, 10].forEach((n, i) => {
    SHAPES.forEach((shape, j) => {
        const no = 272 + i * SHAPES.length + j;
        const smoke = no === 272 ? ' @smoke' : '';
        test(`A03-E-${no} 모바일 ${n}명 판 투표 30초 · ${shape.label} → 30초 끝에 판정 "${OUTCOME_TEXT[shape.outcome]}" @game @realtime${smoke}`, async ({ user, table }) => {
            const t = await openVote(table, user, n, { settings: { dayVoteTime: 30 } });
            const deadline = await voteDeadline(t.bots[1], 1);
            const names = await namesOf(t);
            const me = uuidOf(user);
            const X = uuidOf(t.bots[0]);
            // 몰표: X 말고 전원 X (X는 안 냄 → 마감에 기권) / 1표: 사람만 X
            const plan = shape.outcome === 'TRIBUNAL'
                ? new Map([[me, X], ...t.bots.slice(1).map((b) => [uuidOf(b), X])])
                : new Map([[me, X]]);
            await castMine(user.page, X, names);
            const panel = await openStatus(user.page);
            await castBots(t, plan);
            await expectAtDeadline(t.bots[1], deadline, 1);
            await expectOutcome(user.page, panel, shape.outcome, names.get(X));
            const abstain = shape.outcome === 'TRIBUNAL' ? 1 : n - 1;
            await expect(panel.getByTestId('vote-status-public-abstain-count')).toHaveText(String(abstain));
        });
    });
});

test('A03-E-279 모바일 6명 판 사람이 끝까지 안 냄 → 마감에 기권 칸에 들어감 @game @realtime', async ({ user, table }) => {
    const t = await openVote(table, user, 6, { settings: { dayVoteTime: 30 } });
    const deadline = await voteDeadline(t.bots[1], 1);
    const names = await namesOf(t);
    const [X, Y] = t.bots.map(uuidOf);
    // 봇만 냄: X→Y, 나머지 봇 4 → X → X 4·Y 1·기권 1(사람)
    const plan = new Map([[X, Y], ...t.bots.slice(1).map((b) => [uuidOf(b), X])]);
    const panel = await openStatus(user.page);
    await castBots(t, plan);
    await expectAtDeadline(t.bots[1], deadline, 1);
    await expectOutcome(user.page, panel, 'TRIBUNAL', names.get(X));
    await expect(panel.getByTestId('vote-status-public-abstain-count')).toHaveText('1');
});
