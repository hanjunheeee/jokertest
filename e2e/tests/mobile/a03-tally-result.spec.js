'use strict';

// 모바일 낮 투표 결과 표 시험: 5~10명 판 × 결과 4(몰표·두 명 동점·1표 나머지 기권·전원 기권), 사람도 같이 내고 다 낸 뒤 진짜 5초 기다림
// 목록 A03-낮투표.md A03-E-025~048 (모바일 몫), 돌리지 않고 모임만: npx playwright test --list tests/mobile/a03-tally-result.spec.js
const { test, expect } = require('../../helpers/fixtures');
const { talk, startTalkGame, toDay, toVote, toNight, clearOverlays } = require('./_talk');

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

// 사람 표: null이면 기권 단추 → 기권 단추가 꺼지면 서버가 받은 것
// 사람이면 그 사람 카드 '투표하기' → 다시 연 그 카드 시트가 '투표취소'면 서버가 받은 것
// (사람을 찍어도 기권 단추가 안 잠김 — 기권으로 바꾸기 됨, PC와 같음, 사용자 결정 2026-11-18)
async function castMine(page, target, names) {
    if (target === null) {
        await abstainButton(page).click();
        await expect(abstainButton(page)).toBeDisabled();
        return;
    }
    const sheet = await openSheet(page, names.get(target));
    await sheet.getByRole('menuitem', { name: '투표하기' }).click();
    await expect(sheet).toBeHidden();
    await expect(async () => {
        if (!(await sheet.isVisible().catch(() => false))) await openSheet(page, names.get(target));
        await expect(sheet.getByRole('menuitem', { name: '투표취소' })).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 15_000 });
    await sheet.getByRole('button', { name: '닫기' }).click();
    await expect(sheet).toBeHidden();
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
    const tribunal = page.locator('[data-ingame-tribunal-presentation]');
    if (kind === 'TRIBUNAL') {
        await expect(tribunal).toBeVisible({ timeout: 15_000 });
        await expect(tribunal).toContainText(targetNick);
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

// ── 시험 ──

// 결과 4: 표 모양(인원 n) · 결과 값 · 이름
const SHAPES = [
    { label: '몰표', spec: (n) => ({ x: n - 1, y: 1 }), outcome: 'TRIBUNAL' },
    // 동점은 최다가 기권보다 많아야 "동점"으로 나옴 (같거나 적으면 기권 많음이 먼저)
    { label: '두 명 동점', spec: (n) => ({ x: Math.floor(n / 2), y: Math.floor(n / 2) }), outcome: 'TIE' },
    { label: '1표 나머지 기권', spec: () => ({ x: 1, y: 0 }), outcome: 'ABSTAIN_MAJORITY' },
    { label: '전원 기권', spec: () => ({ x: 0, y: 0 }), outcome: 'ABSTAINED' },
];
const SIZES = [5, 6, 7, 8, 9, 10];

SIZES.forEach((n, i) => {
    SHAPES.forEach((shape, j) => {
        const no = 25 + i * SHAPES.length + j;
        const id = `A03-E-${String(no).padStart(3, '0')}`;
        // E-025만 사파리에서도 (목록 표시), 파일 대표(@smoke)도 같은 것
        const extra = no === 25 ? ' @safari @smoke' : '';
        const screen = shape.outcome === 'TRIBUNAL' ? '재판 창' : '밤 안내';
        test(`${id} 모바일 ${n}명 판 ${shape.label} → 현황 '${OUTCOME_TEXT[shape.outcome]}'·${screen} @game${extra}`, async ({ user, table }) => {
            const t = await openVote(table, user, n);
            const names = await namesOf(t);
            const me = uuidOf(user);
            const [X, Y] = t.bots.map(uuidOf);
            // 사람이 맨 앞 → 1표면 사람이 X를 찍음 (받은 버그 9 모양)
            const plan = allocate([me, X, Y, ...t.bots.slice(2).map(uuidOf)], X, Y, shape.spec(n));

            await castMine(user.page, plan.get(me), names);
            const panel = await openStatus(user.page);
            await expect(panel.getByTestId('vote-status-unresolved')).toHaveText('집계 전');
            // 봇이 마지막 표 → 다 참 → 진짜 5초 뒤 판정 (손잡이 안 씀)
            await castBots(t, plan);
            await expectOutcome(user.page, panel, shape.outcome, names.get(X));
            // 재판이면 재판 동안 현황 창이 닫혀 있음 → 밤에 다시 열어 "재판 회부"를 봄
            if (shape.outcome === 'TRIBUNAL') await statusAfterTribunal(t, user.page);
        });
    });
});
