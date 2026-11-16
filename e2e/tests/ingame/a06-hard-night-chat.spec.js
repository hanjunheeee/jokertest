'use strict';

// 밤 직업 채팅을 사람 여럿 화면으로 확인(어려움): 직업끼리만 보임, 시민은 닫힘, 죽은 광대는 읽기만, 둘째 날까지 이어서, 직업 4채널 나뉨
// 목록 A06-H-001~004·020 — 쓰는 동안엔 안 돌림: npx playwright test --list tests/ingame/a06-hard-night-chat.spec.js
const { test, expect } = require('../../helpers/fixtures');
const { customRoleSettings } = require('../../helpers/game');
const { expectReadable } = require('../../helpers/visible');
const ui = require('../../helpers/ui');
const day = require('./a-day/_lib');
const c = require('./c-chat/_lib');

// 단계 시간을 길게 둠: 단계는 손잡이로 넘기고, 확인하는 동안 진짜 마감이 끼어들지 않게 (이 파일은 마감 시간을 안 봄)
const SLOW = Object.freeze({ dayDiscussionTime: 150, dayVoteTime: 90, tribunalTime: 120, nightActionTime: 120 });
const NIGHT_CLOSED = '밤에는 시민이 채팅을 쓸 수 없습니다';
const DAY_NOTICE = '낮이 되었습니다';
const NIGHT_NOTICE = '밤이 되었습니다';

// 시험마다 다른 글 (다른 시험 채팅과 안 섞이게)
const uniq = (prefix) => `${prefix}${Math.random().toString(36).slice(2, 7)}`;
const nick = (who) => who.account.nickname;
const heardAny = (bot, text) => bot.events.some((r) => r.payload?.text === text);
// 앞서 보낸 알림이 봇에 다 닿았는지: 같은 소켓으로 묻고 답을 받음 (소켓 하나 안에서는 순서가 지켜져 고정 쉬기 없이 "안 옴"을 봄)
const settle = (t, bots = t.bots) => Promise.all(bots.map((b) => b.snapshot(t.gameId)));
const closedReason = (page) => page.getByText(NIGHT_CLOSED, { exact: true });

/** 조건에 맞는 봇만 (서버 판 값 기준) */
async function pick(t, match) {
    const s = await t.state();
    return t.bots.filter((b) => match(s.players.find((p) => p.uuid === b.account.uuid)));
}

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

/** 봇 표로 한 사람을 처형 (낮 투표 → 재판 유죄), 사람은 안 내서 기권으로 셈 */
async function execute(t, uuid) {
    await t.assertBotsCanExecute(uuid);
    await t.advanceUntil('DAY_VOTE');
    const voters = await pick(t, (p) => p.alive && p.uuid !== uuid);
    await day.botsVote(t, uuid, voters);
    expect((await day.resolveVote(t)).phase, '봇 표로 재판이 열려야 함').toBe('TRIBUNAL');
    await day.botsTribunal(t, 'GUILTY', voters);
    await day.resolveTribunal(t);
    await day.waitState(t, (s) => s.players.find((p) => p.uuid === uuid)?.alive === false);
}

/** 처형된 사람 화면: 연출 뒤에 뜨는 "사망 후 선택"에서 관전 계속하기 (앞 연출·안내 창이 잠깐 가려 여러 번 봄) */
async function keepWatching(page) {
    const dialog = page.getByRole('dialog', { name: '사망 후 선택' });
    await expect(async () => {
        const stuck = page.locator('[data-ingame-night-success-kill] button').first();
        if (await stuck.isVisible().catch(() => false)) await stuck.click({ timeout: 1000 }).catch(() => {});
        await c.dismissOverlays(page, { keepWatching: false });
        await dialog.getByRole('button', { name: '관전 계속하기' }).click({ timeout: 2000 });
    }).toPass({ timeout: 60000 });
    await expect(dialog).toBeHidden();
    await ready(page);
}

/** 화면에서 말하고 내 칸에 그 줄이 보일 때까지 (서버가 나에게도 돌려준 것) */
async function sayAndSee(who, text) {
    await c.say(who.page, text);
    await c.expectLine(who.page, nick(who), text);
}

test('A06-H-001 세 사람 세 직업 밤 (사람 광대·의사·시민 + 봇 4 = 7명 직접 구성): 광대 글은 의사·시민 화면에 없고 의사 글은 광대·시민 화면에 없음, 시민은 까닭 글 @game @hard @smoke', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    const joker = user;
    const doctor = await players.add();
    const citizen = await players.add();
    const t = await seat(table, [joker, doctor, citizen], {
        humanRoles: ['JOKER', 'DOCTOR', 'CITIZEN'],
        botRoles: ['CITIZEN', 'CITIZEN', 'CITIZEN', 'CITIZEN'],
        counts: { JOKER: 1, DOCTOR: 1 },
    });
    await t.advanceUntil('NIGHT');
    await Promise.all([passNotice(joker.page, NIGHT_NOTICE), passNotice(doctor.page, NIGHT_NOTICE), expectNightClosed(citizen.page)]);

    const jokerText = uniq('광대글');
    const doctorText = uniq('의사글');
    await sayAndSee(joker, jokerText);
    // 의사는 광대 글 뒤에 말함: 의사 화면에 자기 글이 보이면 그 앞에 온 알림은 다 그려진 것 → 그때도 광대 글이 없음
    await sayAndSee(doctor, doctorText);
    await expect(c.chatLog(doctor.page)).not.toContainText(jokerText);
    // 광대도 표지 글을 하나 더 보내 그 글이 보인 뒤에 의사 글이 없는지 봄
    await sayAndSee(joker, uniq('광대표지'));
    await expect(c.chatLog(joker.page)).not.toContainText(doctorText);

    // 시민 사람: 두 직업 글이 다 없고 까닭 글만 읽힘
    await expect(c.chatLog(citizen.page)).not.toContainText(jokerText);
    await expect(c.chatLog(citizen.page)).not.toContainText(doctorText);
    await expectNightClosed(citizen.page);
    // 시민 봇도 아무 글도 못 받음
    await settle(t);
    for (const b of t.bots) {
        expect(heardAny(b, jokerText), `시민 봇 ${b.nickname}이 광대 글을 받음`).toBe(false);
        expect(heardAny(b, doctorText), `시민 봇 ${b.nickname}이 의사 글을 받음`).toBe(false);
    }
});

test('A06-H-002 같은 직업 두 사람 대화 (사람 의사·의사·시민 + 봇 3 = 6명 직접 의사 2): 의사 둘은 서로 보이고 시민 사람 화면은 0줄 @game @hard', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    const doctorA = user;
    const doctorB = await players.add();
    const citizen = await players.add();
    const t = await seat(table, [doctorA, doctorB, citizen], {
        humanRoles: ['DOCTOR', 'DOCTOR', 'CITIZEN'],
        botRoles: ['JOKER', 'CITIZEN', 'CITIZEN'],
        counts: { JOKER: 1, DOCTOR: 2 },
    });
    await t.advanceUntil('NIGHT');
    await Promise.all([passNotice(doctorA.page, NIGHT_NOTICE), passNotice(doctorB.page, NIGHT_NOTICE), expectNightClosed(citizen.page)]);

    const fromA = uniq('의사가');
    const fromB = uniq('의사나');
    await sayAndSee(doctorA, fromA);
    await c.expectLine(doctorB.page, nick(doctorA), fromA);
    await sayAndSee(doctorB, fromB);
    await c.expectLine(doctorA.page, nick(doctorB), fromB);

    // 시민 사람 화면: 밤 채팅 칸에 줄이 하나도 없음
    await expect(c.chatLog(citizen.page).getByRole('listitem')).toHaveCount(0);
    await expect(c.chatLog(citizen.page)).not.toContainText(fromA);
    await expect(c.chatLog(citizen.page)).not.toContainText(fromB);
    // 의사가 아닌 봇(광대·시민)도 못 받음
    await settle(t);
    for (const b of t.bots) {
        expect(heardAny(b, fromA), `봇 ${b.nickname}이 의사 글을 받음`).toBe(false);
        expect(heardAny(b, fromB), `봇 ${b.nickname}이 의사 글을 받음`).toBe(false);
    }
});

test('A06-H-003 죽은 광대 읽기만 (사람 광대·광대 + 봇 5 = 7명): 처형된 광대는 산 광대 글을 보지만 그 사람 글은 산 광대 화면에 없음 @game @hard', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    const deadJoker = user;
    const liveJoker = await players.add();
    const t = await seat(table, [deadJoker, liveJoker], {
        humanRoles: ['JOKER', 'JOKER'],
        botRoles: ['CITIZEN', 'CITIZEN', 'CITIZEN', 'CITIZEN', 'CITIZEN'],
        counts: { JOKER: 2 },
    });
    await t.advanceUntil('DAY');
    await Promise.all([passNotice(deadJoker.page, DAY_NOTICE), passNotice(liveJoker.page, DAY_NOTICE)]);

    // 1일 재판으로 광대 한 명 처형 → 그 밤
    await execute(t, deadJoker.account.uuid);
    await Promise.all([keepWatching(deadJoker.page), passNotice(liveJoker.page, NIGHT_NOTICE)]);
    expect((await t.state()).phase).toBe('NIGHT');

    // 산 광대 글은 죽은 광대 화면에 보임 (읽기만)
    const fromLive = uniq('산광대');
    await sayAndSee(liveJoker, fromLive);
    await c.expectLine(deadJoker.page, nick(liveJoker), fromLive);

    // 죽은 광대가 쓰면 죽은 사람 채팅 → 산 광대 화면에 없음 (산 광대가 표지 글을 보낸 뒤에도)
    const fromDead = uniq('죽은광대');
    await sayAndSee(deadJoker, fromDead);
    expect(await c.lineChannel(deadJoker.page, fromDead)).toBe('DEAD');
    await sayAndSee(liveJoker, uniq('산광대표지'));
    await expect(c.chatLog(liveJoker.page)).not.toContainText(fromDead);
    await settle(t);
    for (const b of t.bots) expect(heardAny(b, fromDead), `산 봇 ${b.nickname}이 죽은 사람 글을 받음`).toBe(false);
});

test('A06-H-004 둘째 날까지 이어서 (사람 의사·시민 + 봇 4 = 6명 직접 의사 1): 1일·2일 밤 의사는 말하고 시민은 두 밤 다 닫힘, 2일 낮엔 둘이 대화 @game @hard', async ({ user, players, table }) => {
    test.setTimeout(300_000);
    const doctor = user;
    const citizen = await players.add();
    const t = await seat(table, [doctor, citizen], {
        humanRoles: ['DOCTOR', 'CITIZEN'],
        botRoles: ['JOKER', 'CITIZEN', 'CITIZEN', 'CITIZEN'],
        counts: { JOKER: 1, DOCTOR: 1 },
    });

    // 1일 밤
    const firstNight = await t.advanceUntil('NIGHT');
    await Promise.all([passNotice(doctor.page, NIGHT_NOTICE), expectNightClosed(citizen.page)]);
    const night1 = uniq('첫밤');
    await sayAndSee(doctor, night1);

    // 2일 낮: 둘이 주고받음
    await t.advanceUntil((s) => s.phase === 'DAY' && s.dayIndex > firstNight.dayIndex);
    await Promise.all([passNotice(doctor.page, DAY_NOTICE), passNotice(citizen.page, DAY_NOTICE)]);
    const fromDoctor = uniq('낮의사');
    const fromCitizen = uniq('낮시민');
    await sayAndSee(doctor, fromDoctor);
    await c.expectLine(citizen.page, nick(doctor), fromDoctor);
    await sayAndSee(citizen, fromCitizen);
    await c.expectLine(doctor.page, nick(citizen), fromCitizen);

    // 2일 밤: 의사는 또 말하고 시민은 또 닫힘
    const secondNight = await t.advanceUntil((s) => s.phase === 'NIGHT' && s.dayIndex > firstNight.dayIndex);
    expect(secondNight.dayIndex).toBe(firstNight.dayIndex + 1);
    await Promise.all([passNotice(doctor.page, NIGHT_NOTICE), expectNightClosed(citizen.page)]);
    const night2 = uniq('둘째밤');
    await sayAndSee(doctor, night2);
    await expect(c.chatLog(citizen.page)).not.toContainText(night1);
    await expect(c.chatLog(citizen.page)).not.toContainText(night2);
    await expectNightClosed(citizen.page);
});

test('A06-H-020 직업 4채널이 나뉨 (사람 광대·의사·경비원·마녀사냥꾼 + 봇 6 = 10명): 첫 밤 넷이 하나씩 보내면 각자 화면에 자기 글만 @game @hard', async ({ user, players, table }) => {
    test.setTimeout(300_000);
    const people = [user, await players.add(), await players.add(), await players.add()];
    const roles = ['JOKER', 'DOCTOR', 'GUARD', 'WITCH_HUNTER'];
    const t = await seat(table, people, {
        humanRoles: roles,
        botRoles: ['CITIZEN', 'CITIZEN', 'CITIZEN', 'CITIZEN', 'CITIZEN', 'CITIZEN'],
    });
    await t.advanceUntil('NIGHT');
    await Promise.all(people.map((p) => passNotice(p.page, NIGHT_NOTICE)));

    // 넷이 하나씩 보냄 → 그다음 표지 글을 하나씩 더 (표지가 보이면 그 앞에 온 알림은 다 그려진 것)
    const texts = roles.map((role) => uniq(`밤${role}`));
    for (let i = 0; i < people.length; i += 1) await sayAndSee(people[i], texts[i]);
    for (let i = 0; i < people.length; i += 1) await sayAndSee(people[i], uniq(`표지${i}`));

    for (let i = 0; i < people.length; i += 1) {
        for (let k = 0; k < people.length; k += 1) {
            if (k === i) continue;
            await expect(c.chatLog(people[i].page), `${roles[i]} 화면에 ${roles[k]} 글`).not.toContainText(texts[k]);
        }
    }
    // 시민 봇은 어느 직업 글도 못 받음
    await settle(t);
    for (const b of t.bots) for (const text of texts) expect(heardAny(b, text), `시민 봇 ${b.nickname}이 직업 글을 받음`).toBe(false);
});
