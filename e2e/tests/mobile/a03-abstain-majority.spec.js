'use strict';

// 모바일 [받은 버그 9] 기권이 많으면 재판 없이 밤 시험: 7명 판 1표 6기권, 인원 5·8·9·10에서 최다 = 기권 경계
// 목록 A03-낮투표.md A03-E-050, A03-E-063~066, 돌리지 않고 모임만: npx playwright test --list tests/mobile/a03-abstain-majority.spec.js
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

// 표 나누기: order 차례로 X에 x표, Y에 y표, 나머지 기권 (자기는 못 찍어 X는 Y·기권, Y는 X·기권)
// 예: allocate([나, X, Y, 봇2], X, Y, { x: 2, y: 1 }) → 나→X, X→Y, Y→X, 봇2→기권
function allocate(order, X, Y, { x = 0, y = 0 }) {
    const need = { x, y };
    const plan = new Map();
    for (const v of order) {
        if (v !== X && need.x > 0) { need.x -= 1; plan.set(v, X); }
        else if (Y && v !== Y && need.y > 0) { need.y -= 1; plan.set(v, Y); }
        else plan.set(v, null);
    }
    if (need.x > 0 || need.y > 0) throw new Error(`표 나누기 실패 (남은 X ${need.x}·Y ${need.y})`);
    return plan;
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

// ── 시험 ──

test('A03-E-050 [버그 9] 모바일 7명 판 사람 1표·봇 6기권 → 재판 창 안 뜨고 밤, 현황 "기권이 많아 재판 없음" @game @safari @smoke', async ({ user, table }) => {
    const t = await openVote(table, user, 7);
    const names = await namesOf(t);
    const me = uuidOf(user);
    const [X] = t.bots.map(uuidOf);
    const plan = allocate([me, ...t.bots.map(uuidOf)], X, null, { x: 1 });

    await castMine(user.page, X, names);
    const panel = await openStatus(user.page);
    await castBots(t, plan);
    await expectOutcome(user.page, panel, 'ABSTAIN_MAJORITY');
    // 기권 칸은 6 (봇 6 기권)
    await expect(panel.getByTestId('vote-status-public-abstain-count')).toHaveText('6');
});

// 최다 = 기권 표 모양 [X 표, Y 표, 기권] (B-001~036 ④, 백엔드 흐름 시험 EQUAL과 같음)
const EQUAL = [
    { n: 5, x: 2, y: 1, a: 2 },
    { n: 8, x: 4, y: 0, a: 4 },
    { n: 9, x: 4, y: 1, a: 4 },
    { n: 10, x: 5, y: 0, a: 5 },
];

EQUAL.forEach(({ n, x, y, a }, i) => {
    const id = `A03-E-${String(63 + i).padStart(3, '0')}`;
    test(`${id} [버그 9] 모바일 ${n}명 판 최다 ${x} = 기권 ${a}${y ? `(Y ${y})` : ''} → 재판 없이 밤 @game`, async ({ user, table }) => {
        const t = await openVote(table, user, n);
        const names = await namesOf(t);
        const me = uuidOf(user);
        const [X, Y] = t.bots.map(uuidOf);
        const plan = allocate([me, X, Y, ...t.bots.slice(2).map(uuidOf)], X, Y, { x, y });

        await castMine(user.page, plan.get(me), names);
        const panel = await openStatus(user.page);
        await castBots(t, plan);
        await expectOutcome(user.page, panel, 'ABSTAIN_MAJORITY');
        await expect(panel.getByTestId('vote-status-public-abstain-count')).toHaveText(String(a));
    });
});
