'use strict';

// 낮 토론 어려움 시험: 사람 4명이 같은 판에서 전원 준비면 바로 투표, 한 사람만 "낮이 되었습니다" 창을 안 눌러도 다른 사람은 준비·채팅되고 시간은 같이 흐름
// 목록 A03-낮투표.md A03-H-014·015, 돌리지 않고 모임만: npx playwright test --list tests/ingame/a03-hard-discussion.spec.js
const { test, expect } = require('../../helpers/fixtures');
const ui = require('../../helpers/ui');
const D = require('./a-day/_lib');

// ── 이 파일 도우미 (공용으로 올릴 후보: 사람 여럿 낮 투표 묶음 — PC·모바일 화면 섞임) ──

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

const abstainButton = (page) => page.getByRole('button', { name: '기권' });

const noticeOf = (page) => page.getByRole('dialog', { name: '단계 전환 안내' });

// 사람 하나 더 (각자 다른 계정·쿠키), 모바일이면 표시를 붙여 둠
async function addPerson(players, { mobile = false } = {}) {
    const p = await players.add({ mobile });
    return { ...p, mobile };
}

const readyOf = (page) => page.locator('[data-ingame-phase-action="dayReady"]');

// PC 시간 바 펼쳐 남은 초 읽기 (접혀 있으면 시계가 안 보임)
async function readTimer(page) {
    const expand = page.getByRole('button', { name: '시간흐름바 확대' });
    if (await expand.isVisible()) await expand.click();
    await expect(page.getByRole('timer').first()).toBeVisible();
    return D.timerSeconds(page);
}

// ── 시험 ──

test('A03-H-014 5명 판(사람 4) 토론 전원 준비 → 마지막 준비에 네 화면 바로 투표 @game @hard @smoke', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    const humans = [{ ...user, mobile: false }];
    for (let i = 1; i < 4; i += 1) humans.push(await addPerson(players));
    const roles = rolePlan(5);
    const t = await table.setup({ humans, bots: 1, roles, settings: { dayDiscussionTime: 150 } });
    await expectRoles(t, roles);
    await D.toDay(t);
    // 봇·사람 3 준비 → 마지막 사람 준비 → 150초 안 기다리고 바로 투표
    const botReady = await t.bots[0].request('ready_for_day_vote', { gameId: t.gameId });
    expect(botReady?.ok).toBe(true);
    for (const h of humans.slice(0, 3)) {
        await readyOf(h.page).click();
        await expect(readyOf(h.page)).toHaveText('준비 완료');
    }
    expect((await t.state()).dayPhase).toBe('DAY_DISCUSSION');
    const at = Date.now();
    await readyOf(humans[3].page).click();
    await Promise.all(humans.map((h) => expect(abstainButton(h.page)).toBeEnabled({ timeout: 5_000 })));
    expect(Date.now() - at).toBeLessThan(10_000);
    expect((await t.state()).dayPhase).toBe('DAY_VOTE');
});

test('A03-H-015 6명 판(사람 2) 한 사람이 "낮이 되었습니다" 창 안 누름 → 그 사람만 조작 막힘, 시간은 같이 흐름, 다른 사람은 준비·채팅 됨 @game @hard', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    const open = { ...user, mobile: false };
    const late = await addPerson(players);
    const roles = rolePlan(6);
    const t = await table.setup({ humans: [open, late], bots: 4, roles, settings: { dayDiscussionTime: 150 } });
    await expectRoles(t, roles);
    for (const h of [open, late]) await D.closeReveal(h.page);
    await t.advanceUntil('DAY');
    await D.closeNotice(open.page, '낮이 되었습니다');
    const lateNotice = noticeOf(late.page);
    await expect(lateNotice).toContainText('낮이 되었습니다');

    // 안 누른 사람: 준비 단추가 막힌 판 화면(inert) 안 + 꺼짐
    await expect(late.page.locator('[inert] [data-ingame-phase-action="dayReady"]')).toHaveCount(1);
    await expect(readyOf(late.page)).toBeDisabled();
    // 누른 사람: 준비·채팅 됨 (안 누른 사람 화면에도 채팅이 옴)
    await readyOf(open.page).click();
    await expect(readyOf(open.page)).toHaveText('준비 완료');
    const line = `h015${Date.now() % 100000}`;
    await D.sendChatOk(open.page, line);
    await expect(ui.chatLog(open.page)).toContainText(line);
    await expect(ui.chatLog(late.page)).toContainText(line);

    // 시간: 누른 사람 시계를 읽고, 몇 초 뒤 안 누른 사람이 창을 닫고 읽은 값이 그만큼 줄어 있음
    const openSec = await readTimer(open.page);
    const openAt = Date.now();
    await expect(lateNotice).toBeVisible();
    await lateNotice.getByRole('button', { name: '확인' }).click();
    await expect(lateNotice).toBeHidden();
    const lateSec = await readTimer(late.page);
    const passed = (Date.now() - openAt) / 1000;
    expect(Math.abs(lateSec - (openSec - passed))).toBeLessThanOrEqual(2);
    await expect(readyOf(late.page)).toBeEnabled();
});
