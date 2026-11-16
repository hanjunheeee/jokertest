'use strict';

// PC 사람과 모바일 사람이 섞인 판의 채팅(어려움): 의사끼리 밤 채팅이 두 화면에 오감, 시민은 둘 다 닫힘·낮엔 서로 대화
// 목록 A06-H-013·014 — 쓰는 동안엔 안 돌림: npx playwright test --list tests/ingame/a06-hard-mixed-device.spec.js
const { test, expect } = require('../../helpers/fixtures');
const { customRoleSettings } = require('../../helpers/game');
const { expectReadable } = require('../../helpers/visible');
const ui = require('../../helpers/ui');
const c = require('./c-chat/_lib');
const m = require('../mobile/_talk');

// 단계 시간을 길게 둠: 단계는 손잡이로 넘기고, 확인하는 동안 진짜 마감이 끼어들지 않게 (이 파일은 마감 시간을 안 봄)
const SLOW = Object.freeze({ dayDiscussionTime: 150, dayVoteTime: 90, tribunalTime: 120, nightActionTime: 120 });
const NIGHT_CLOSED = '밤에는 시민이 채팅을 쓸 수 없습니다';
const DAY_NOTICE = '낮이 되었습니다';
const NIGHT_NOTICE = '밤이 되었습니다';
// 모바일 같은 직업 말풍선 바탕색 (카톡형 결정: 붉은색)
const RED_OTHER = 'rgb(74, 20, 20)';

const { talk } = m;

// 시험마다 다른 글 (다른 시험 채팅과 안 섞이게)
const uniq = (prefix) => `${prefix}${Math.random().toString(36).slice(2, 7)}`;
const nick = (who) => who.account.nickname;
const closedReason = (page) => page.getByText(NIGHT_CLOSED, { exact: true });
// 모바일 말풍선 글 칸
const bubble = (line) => line.locator('p.whitespace-pre-wrap');

/**
 * 판 차리기: 사람 여럿 + 봇, 직업을 전부 정하고 서버 값으로 한 번 확인 → 역할 확인 창 닫음
 * counts를 주면 직접 구성(예: { JOKER: 1, DOCTOR: 2 }), 안 주면 자동 구성
 */
async function seat(table, humans, { humanRoles, botRoles, counts = null }) {
    const t = await table.setup({
        humans,
        bots: botRoles.length,
        settings: counts ? customRoleSettings(counts, SLOW) : { ...SLOW },
        roles: ({ bots }) => ({
            ...Object.fromEntries(humans.map((h, i) => [h.account.uuid, humanRoles[i]])),
            ...Object.fromEntries(bots.map((b, i) => [b.account.uuid, botRoles[i]])),
        }),
    });
    const s = await t.state();
    const roleOf = (uuid) => s.players.find((p) => p.uuid === uuid)?.role;
    humans.forEach((h, i) => expect(roleOf(h.account.uuid), `사람 ${i} 직업`).toBe(humanRoles[i]));
    t.bots.forEach((b, i) => expect(roleOf(b.account.uuid), `봇 ${i} 직업`).toBe(botRoles[i]));
    await Promise.all(humans.map((h) => ui.readRoleReveal(h.page)));
    return t;
}

/** 연출·안내 창을 닫아 가며 채팅 칸을 쓸 수 있을 때까지 (밤 암살 영상이 멈춰 있으면 그 창의 단추) */
async function ready(page) {
    await expect(async () => {
        const stuck = page.locator('[data-ingame-night-success-kill] button').first();
        if (await stuck.isVisible().catch(() => false)) await stuck.click({ timeout: 1000 }).catch(() => {});
        await c.readyToChat(page, { timeoutMs: 2500 });
    }).toPass({ timeout: 40000 });
}

/**
 * 화면이 낮·밤 시작을 따라왔는지: "낮이 되었습니다"·"밤이 되었습니다" 창이 뜰 때까지 → 확인 눌러 닫고 채팅 칸 준비
 * (PC 시간 바는 접혀 있어 단계 글이 안 보임 → 이 창이 단계가 바뀐 표시, 앞 단계 창·추방 연출은 닫아 가며 기다림)
 */
async function passNotice(page, text) {
    const notice = page.getByRole('dialog', { name: '단계 전환 안내' });
    await expect(async () => {
        const stuck = page.locator('[data-ingame-night-success-kill] button').first();
        if (await stuck.isVisible().catch(() => false)) await stuck.click({ timeout: 1000 }).catch(() => {});
        const expulsion = page.locator('[data-ingame-tribunal-expulsion]').last();
        if (await expulsion.isVisible().catch(() => false)) await expulsion.click({ timeout: 500, force: true }).catch(() => {});
        if (await notice.isVisible().catch(() => false)) {
            const said = await notice.innerText().catch(() => '');
            if (!said.includes(text)) await notice.getByRole('button', { name: '확인' }).click({ timeout: 1000 }).catch(() => {});
        }
        await expect(notice).toContainText(text, { timeout: 1000 });
    }).toPass({ timeout: 45000 });
    await notice.getByRole('button', { name: '확인' }).click();
    await ready(page);
}

/** 밤 시민 화면: 입력칸 대신 까닭 글이 읽힘 (추방 연출·늦게 뜬 안내 창은 넘겨 가며) */
async function expectNightClosed(page) {
    await expect(async () => {
        const expulsion = page.locator('[data-ingame-tribunal-expulsion]').last();
        if (await expulsion.isVisible().catch(() => false)) await expulsion.click({ timeout: 500, force: true }).catch(() => {});
        await c.dismissOverlays(page);
        await expectReadable(closedReason(page), { timeout: 1500 });
    }).toPass({ timeout: 45000 });
    await expect(c.chatBox(page)).toHaveCount(0);
}

/** 화면에서 말하고 내 칸에 그 줄이 보일 때까지 (서버가 나에게도 돌려준 것) */
async function sayAndSee(who, text) {
    await c.say(who.page, text);
    await c.expectLine(who.page, nick(who), text);
}

/** 모바일 화면: 안내 창을 닫아 가며 입력 줄을 쓸 수 있을 때까지 */
async function mobileReady(page) {
    await expect(async () => {
        await m.clearOverlays(page);
        expect(await talk.input(page).evaluate((el) => !el.closest('[inert]'), null, { timeout: 1000 })).toBe(true);
    }).toPass({ timeout: 40000 });
}

/** 모바일 화면: 늦게 뜬 안내 창을 닫아 가며 진짜 읽히는지 */
async function mobileReadable(page, locator) {
    await expect(async () => {
        await m.clearOverlays(page);
        await expectReadable(locator, { timeout: 1500 });
    }).toPass({ timeout: 30000 });
}

test('A06-H-013 PC 의사 + 모바일 의사 (사람 2 + 봇 4 = 6명 직접 의사 2): PC 글은 모바일에 붉은 말풍선 + 띠, 모바일 글은 PC 칸에 보임 @game @hard @smoke', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    const pc = user;
    const phone = await players.add({ mobile: true });
    const t = await seat(table, [pc, phone], {
        humanRoles: ['DOCTOR', 'DOCTOR'],
        botRoles: ['JOKER', 'CITIZEN', 'CITIZEN', 'CITIZEN'],
        counts: { JOKER: 1, DOCTOR: 2 },
    });
    await t.advanceUntil('NIGHT');
    await passNotice(pc.page, NIGHT_NOTICE);
    await expect(talk.phaseLine(phone.page)).toContainText('밤', { timeout: 20000 });
    await mobileReady(phone.page);

    // PC → 모바일: 띠가 읽히고 PC 글이 붉은 말풍선으로
    await mobileReadable(phone.page, talk.nightBanner(phone.page));
    const fromPc = uniq('피시의사');
    await sayAndSee(pc, fromPc);
    const line = talk.others(phone.page).filter({ hasText: fromPc });
    await expectReadable(bubble(line));
    expect(await m.bgColor(bubble(line))).toBe(RED_OTHER);
    await expect(line).toContainText(nick(pc));

    // 모바일 → PC
    const fromPhone = uniq('폰의사');
    await mobileReady(phone.page);
    await m.say(phone.page, fromPhone);
    await c.expectLine(pc.page, nick(phone), fromPhone);
});

test('A06-H-014 PC 시민 + 모바일 시민 (사람 2 + 봇 4 = 6명): 밤엔 둘 다 까닭 글이 읽히고 낮엔 서로 대화 @game @hard', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    const pc = user;
    const phone = await players.add({ mobile: true });
    const t = await seat(table, [pc, phone], {
        humanRoles: ['CITIZEN', 'CITIZEN'],
        botRoles: ['JOKER', 'DOCTOR', 'CITIZEN', 'CITIZEN'],
    });

    // 첫 밤: 두 화면 다 입력칸 대신 까닭 글
    const night = await t.advanceUntil('NIGHT');
    await expectNightClosed(pc.page);
    await expect(talk.phaseLine(phone.page)).toContainText('밤', { timeout: 20000 });
    await mobileReadable(phone.page, closedReason(phone.page));
    await expect(talk.input(phone.page)).toHaveCount(0);
    await expect(talk.nightBanner(phone.page)).toHaveCount(0);

    // 다음 낮: 입력칸이 다시 열려 서로 대화
    await t.advanceUntil((s) => s.phase === 'DAY' && s.dayIndex > night.dayIndex);
    await passNotice(pc.page, DAY_NOTICE);
    await expect(talk.phaseLine(phone.page)).toContainText('낮 토론', { timeout: 20000 });
    await mobileReady(phone.page);
    const fromPc = uniq('피시시민');
    await sayAndSee(pc, fromPc);
    await expectReadable(bubble(talk.others(phone.page).filter({ hasText: fromPc })));
    const fromPhone = uniq('폰시민');
    await m.say(phone.page, fromPhone);
    await c.expectLine(pc.page, nick(phone), fromPhone);
});
