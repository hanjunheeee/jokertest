'use strict';

// 이모티콘을 사람 여럿 화면으로 확인(어려움): 세 사람이 같은 순간 보내면 세 화면 모두 말풍선 3개, 역할 확인 중 두 사람
// 목록 A06-H-017·018 — 쓰는 동안엔 안 돌림: npx playwright test --list tests/ingame/a06-hard-emoji.spec.js
const { test, expect } = require('../../helpers/fixtures');
const { customRoleSettings } = require('../../helpers/game');
const ui = require('../../helpers/ui');
const c = require('./c-chat/_lib');
const night = require('./b-night/_night');

// 단계 시간을 길게 둠: 단계는 손잡이로 넘기고, 확인하는 동안 진짜 마감이 끼어들지 않게 (이 파일은 마감 시간을 안 봄)
const SLOW = Object.freeze({ dayDiscussionTime: 150, dayVoteTime: 90, tribunalTime: 120, nightActionTime: 120 });
const DAY_NOTICE = '낮이 되었습니다';
const EMOJI_EVT = 'emoji_shown';
// 기본 지급 이모티콘 (팔레트에 처음부터 들어 있음): 팔레트 단추 이름과 말풍선 id
const EMOJI = Object.freeze({
    hello: { name: '안녕', id: 'emoji-basic-hello' },
    love: { name: '사랑', id: 'emoji-basic-love' },
    tears: { name: '눈물', id: 'emoji-basic-tears' },
});

const nick = (who) => who.account.nickname;
const palette = (page) => page.getByRole('group', { name: '이모티콘 팔레트' });
const bubbleOf = (page, emoji) => page.locator(`[data-ingame-emoji-bubble="${emoji.id}"]`);

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

/** 내 카드(판에서 누르는 칸)를 우클릭해 팔레트 열기 */
async function openPalette(who) {
    await night.cardButton(who.page, nick(who)).click({ button: 'right' });
    await expect(palette(who.page)).toBeVisible();
}

/** 열린 팔레트에서 그 이모티콘 칸 누르기 */
const pickEmoji = (who, emoji) => palette(who.page).getByRole('button', { name: `${emoji.name} 보내기` }).click();

/** 봇이 그 사람의 그 이모티콘 알림을 받을 때까지 */
const hearsEmoji = (bot, who, emoji) => bot.waitForEvent(EMOJI_EVT, {
    match: (p) => p?.uuid === who.account.uuid && p?.itemId === emoji.id,
});

test('A06-H-017 세 사람 같은 순간 이모티콘 (사람 3 + 봇 2 = 5명): 동시에 보내면 세 화면 모두 말풍선 3개 @game @hard @smoke', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    const people = [user, await players.add(), await players.add()];
    const emojis = [EMOJI.hello, EMOJI.love, EMOJI.tears];
    const t = await seat(table, people, {
        humanRoles: ['CITIZEN', 'CITIZEN', 'CITIZEN'],
        botRoles: ['JOKER', 'CITIZEN'],
    });
    await t.advanceUntil('DAY');
    await Promise.all(people.map((p) => passNotice(p.page, DAY_NOTICE)));

    // 셋 다 팔레트를 열어 두고 같은 순간 칸을 누름
    for (const person of people) await openPalette(person);
    await Promise.all(people.map((p, i) => pickEmoji(p, emojis[i])));

    // 말풍선은 잠깐 떴다 사라짐 → 세 화면을 한꺼번에 봄: 화면마다 세 사람 것이 다 뜸
    await Promise.all(people.flatMap((viewer) => emojis.map((emoji) => expect(bubbleOf(viewer.page, emoji)).toBeVisible())));
    // 봇도 세 사람 것을 하나씩 다 받음
    await Promise.all(t.bots.flatMap((b) => people.map((p, i) => hearsEmoji(b, p, emojis[i]))));
    for (const b of t.bots) expect(b.events.filter((r) => r.event === EMOJI_EVT)).toHaveLength(3);
});

// 역할 확인 10초도 "낮에만"에 들어감 (결정 셋째 장 "반장이 정하고 알린 것" 1) — 화면은 팔레트를 안 열고 서버는 INVALID_PHASE로 거절
test('A06-H-018 역할 확인 중 두 사람 이모티콘 (사람 2 + 봇 4 = 6명): 역할 확인 10초 동안은 두 사람 다 팔레트가 안 뜨고 말풍선 없음, 낮이 되면 서로 화면에 말풍선 (결정: 이모티콘은 낮에만) @game @hard', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    const one = user;
    const two = await players.add();
    const t = await seat(table, [one, two], {
        humanRoles: ['CITIZEN', 'CITIZEN'],
        botRoles: ['JOKER', 'DOCTOR', 'CITIZEN', 'CITIZEN'],
    });

    // 역할 확인 창을 닫은 뒤에도 10초가 끝날 때까지는 역할 확인 단계 (손잡이로 안 넘김): 내 카드를 우클릭해도 팔레트가 안 뜸
    await Promise.all([one, two].map((p) => night.cardButton(p.page, nick(p)).click({ button: 'right' })));
    await Promise.all([one, two].map((p) => expect(palette(p.page)).toHaveCount(0)));
    // 봇이 서버로 바로 보내도 거절됨
    const reply = await t.bots[1].request('send_emoji', { gameId: t.gameId, itemId: EMOJI.hello.id });
    expect([reply?.ok, reply?.code], '역할 확인 중 봇 이모티콘 답').toEqual([false, 'INVALID_PHASE']);
    // 여기까지가 아직 역할 확인 10초 안이어야 이 케이스를 본 것
    expect((await t.state()).phase).toBe('ROLE_REVEAL');
    // 봇마다 서버를 한 번 다녀옴 → 그 앞에 나간 이모티콘 알림이 있었다면 이미 와 있음
    await Promise.all(t.bots.map((b) => b.snapshot(t.gameId)));
    for (const b of t.bots) expect(b.events.filter((r) => r.event === EMOJI_EVT)).toHaveLength(0);
    await Promise.all([one, two].map((p) => expect(p.page.locator('[data-ingame-emoji-bubble]')).toHaveCount(0)));

    // 낮이 되면 같은 두 사람이 보낸 것이 서로 화면에 뜸 (막힌 까닭이 단계였다는 표시)
    await t.advanceUntil('DAY');
    await Promise.all([one, two].map((p) => passNotice(p.page, DAY_NOTICE)));
    await Promise.all([openPalette(one), openPalette(two)]);
    await Promise.all([pickEmoji(one, EMOJI.hello), pickEmoji(two, EMOJI.love)]);
    await Promise.all([
        expect(bubbleOf(two.page, EMOJI.hello)).toBeVisible(),
        expect(bubbleOf(one.page, EMOJI.love)).toBeVisible(),
    ]);
    await Promise.all(t.bots.flatMap((b) => [hearsEmoji(b, one, EMOJI.hello), hearsEmoji(b, two, EMOJI.love)]));
});
