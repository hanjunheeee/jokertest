'use strict';

// 모바일 낮 투표 글이 "사람 눈에 읽히는지" 시험(visible.js — 보임·화면 안·안 가려짐·대비): 현황 결과 글 4·"5초 뒤 마감"·재판 대상 이름·"집계 전"
// 목록 A03-낮투표.md A03-E-211·213·215·217·219·221·223 (모바일 몫), 돌리지 않고 모임만: npx playwright test --list tests/mobile/a03-readable.spec.js
const { test, expect } = require('../../helpers/fixtures');
const ui = require('../../helpers/ui');
const { expectReadable } = require('../../helpers/visible');
const {
    talk, startTalkGame, toDay, toVote, toNight, clearOverlays, openPlayer, pickPlayer, closeRoster, trialAny, expectTrialOf,
} = require('./_talk');

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

// 세로 카톡형: 카드 판 대신 플레이어 목록 시트 줄마다 행동 단추 (카드 메뉴와 같은 항목·이름) — _talk.js openPlayer·pickPlayer
// 그 사람 줄 열기 (목록 시트를 열고 줄을 줌, 줄 안 menuitem이 카드 메뉴 항목)
const openSheet = (page, nick) => openPlayer(page, nick);

// 사람 표: null이면 기권 단추 → 기권 단추가 꺼지면 서버가 받은 것
// 사람이면 목록 그 사람 줄 '투표하기' → 그 줄이 '투표취소'면 서버가 받은 것
// (사람을 찍어도 기권 단추가 안 잠김 — 기권으로 바꾸기 됨, PC와 같음, 사용자 결정 2026-11-18)
async function castMine(page, target, names) {
    if (target === null) {
        await abstainButton(page).click();
        await expect(abstainButton(page)).toBeDisabled();
        return;
    }
    await pickPlayer(page, names.get(target), '투표하기', { after: '투표취소' });
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
// 재판이면 재판 연출이 뜨면서 현황 창이 닫힘(재판 단추를 가려서 — frontend-mobile useActionRow) → 창 닫힘까지 보고, 결과 글은 statusAfterTribunal로 밤에 다시 열어 봄
// (전엔 닫히는 움직임 동안 글을 읽어 맞았다 틀렸다 함 — A03-E-025·151·211·221)
async function expectOutcome(page, panel, kind, targetNick) {
    const tribunal = trialAny(page);
    if (kind === 'TRIBUNAL') {
        await expectTrialOf(page, targetNick);
        await expect(panel).toBeHidden();
        return;
    }
    await expect(panel.getByTestId('vote-status-outcome')).toHaveText(OUTCOME_TEXT[kind], { timeout: 15_000 });
    await expect(page.getByRole('dialog', { name: '단계 전환 안내' })).toContainText('밤이 되었습니다');
    await expect(tribunal).toHaveCount(0);
}

// 재판을 아무도 판정 안 낸 채 끝내고(손잡이) 밤으로 → 현황 창을 다시 열면 그날 결과 "재판 회부" 그대로 → 창
async function statusAfterTribunal(t, page) {
    await toNight(t, page);
    const panel = page.getByRole('dialog', { name: '투표 현황' });
    await expect(async () => {
        await clearOverlays(page);
        if (!(await panel.isVisible())) await page.getByRole('button', { name: '투표 현황 열기' }).click({ timeout: 2_000 });
        await expect(panel).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
    await expect(panel.getByTestId('vote-status-outcome')).toHaveText(OUTCOME_TEXT.TRIBUNAL);
    return panel;
}

// 밤으로 갔으면 밤 안내·차례 안내를 닫고 나서 읽힘 확인 (창이 덮은 동안은 가려짐으로 실패하니 닫히면 다시 봄)
async function expectReadableAfterNight(page, locator) {
    await expect(async () => {
        await ui.closeOverlays(page, { names: ['단계 전환 안내', '밤 역할 안내', '알림'], keepWatching: false, rounds: 3 });
        await expectReadable(locator, { timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
}

// ── 시험 ──

// E-211·213·215·217: 결과 4 (모바일) → 현황 결과 글이 읽힘
const SHAPES = [
    { no: 211, n: 6, label: '몰표', spec: (n) => ({ x: n - 1, y: 1 }), outcome: 'TRIBUNAL', extra: ' @safari @smoke' },
    { no: 213, n: 7, label: '두 명 동점', spec: () => ({ x: 3, y: 3 }), outcome: 'TIE', extra: '' },
    { no: 215, n: 7, label: '1표 나머지 기권', spec: () => ({ x: 1, y: 0 }), outcome: 'ABSTAIN_MAJORITY', extra: '' },
    { no: 217, n: 5, label: '전원 기권', spec: () => ({ x: 0, y: 0 }), outcome: 'ABSTAINED', extra: '' },
];

SHAPES.forEach(({ no, n, label, spec, outcome, extra }) => {
    test(`A03-E-${no} 모바일 ${n}명 판 ${label} → 현황 결과 글 "${OUTCOME_TEXT[outcome]}" 읽힘 @game${extra}`, async ({ user, table }) => {
        const t = await openVote(table, user, n);
        const names = await namesOf(t);
        const me = uuidOf(user);
        const [X, Y] = t.bots.map(uuidOf);
        const plan = allocate([me, X, Y, ...t.bots.slice(2).map(uuidOf)], X, Y, spec(n));
        await castMine(user.page, plan.get(me), names);
        const panel = await openStatus(user.page);
        await castBots(t, plan);
        await expectOutcome(user.page, panel, outcome, names.get(X));
        // 재판이면 재판 동안 현황 창이 닫혀 있음 → 밤에 다시 연 창의 결과 글을 봄
        const shown = outcome === 'TRIBUNAL' ? await statusAfterTribunal(t, user.page) : panel;
        await expectReadableAfterNight(user.page, shown.getByTestId('vote-status-outcome'));
    });
});

test('A03-E-219 모바일 6명 판 "5초 뒤 마감" 글 읽힘 @game @realtime @safari', async ({ user, table }) => {
    const t = await openVote(table, user, 6);
    const names = await namesOf(t);
    const [X, Y] = t.bots.map(uuidOf);
    const plan = allocate([X, Y, ...t.bots.slice(2).map(uuidOf), uuidOf(user)], X, Y, { x: 5, y: 1 });
    await castBots(t, plan);
    // 사람이 마지막 표 → 당김 동안 단계 줄 글이 읽힘 (현황 창은 안 열어 단계 줄을 안 덮음)
    await castMine(user.page, X, names);
    await expectReadable(talk.phaseLine(user.page).getByText('[5초 뒤 마감]', { exact: true }), { timeout: 4_000 });
});

test('A03-E-221 모바일 7명 판 현황 재판 대상 닉네임 읽힘 @game', async ({ user, table }) => {
    const t = await openVote(table, user, 7);
    const names = await namesOf(t);
    const [X, Y] = t.bots.map(uuidOf);
    const plan = allocate([uuidOf(user), X, Y, ...t.bots.slice(2).map(uuidOf)], X, Y, { x: 6, y: 1 });
    await castMine(user.page, X, names);
    const panel = await openStatus(user.page);
    await castBots(t, plan);
    await expectOutcome(user.page, panel, 'TRIBUNAL', names.get(X));
    // 재판 동안은 현황 창이 닫혀 있음 → 밤에 다시 연 창의 재판 대상 이름을 봄
    const target = (await statusAfterTribunal(t, user.page)).getByTestId('vote-status-tribunal-target');
    await expect(target).toHaveText(names.get(X));
    await expectReadableAfterNight(user.page, target);
});

test('A03-E-223 모바일 5명 판 현황 "집계 전" 읽힘 @game', async ({ user, table }) => {
    await openVote(table, user, 5);
    const panel = await openStatus(user.page);
    const unresolved = panel.getByTestId('vote-status-unresolved');
    await expect(unresolved).toHaveText('집계 전');
    await expectReadable(unresolved);
});
