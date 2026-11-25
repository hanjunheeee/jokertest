'use strict';

// 모바일 판 중 채팅(브라우저, 폰 세로 카톡형 + 폰 가로): 같은 직업 말풍선·밤 시민 글 막힘·죽은 사람 띠·재판 창 채팅·글 검사·이모티콘·새로고침·화면 돌리기
// 모바일(상대 화면, 커밋 d71ab651)엔 "밤 · 같은 직업끼리" 띠·밤 시민 입력 줄 닫힘·까닭 글이 없음 → 밤 시민은 "보내도 아무 봇도 못 받음"으로 봄
// 목록 A06-E-131~160 (30개) — 쓰는 동안엔 안 돌림: npx playwright test --list tests/mobile/a06-talk-chat.spec.js
const { test, expect } = require('../../helpers/fixtures');
const { customRoleSettings } = require('../../helpers/game');
const { expectReadable } = require('../../helpers/visible');
const bannedWords = require('../../helpers/bannedWords');
const ui = require('../../helpers/ui');
const day = require('../ingame/a-day/_lib');
const m = require('./_talk');

const { talk, BASIC_EMOJI } = m;

// 단계 시간을 길게 둠: 단계는 손잡이로 넘기고, 확인하는 동안 진짜 마감이 끼어들지 않게 (이 파일은 마감 시간을 안 봄)
const SLOW = Object.freeze({ dayDiscussionTime: 150, dayVoteTime: 90, tribunalTime: 120, nightActionTime: 120 });
const DAY_EVT = 'day_chat_message_received';
const ROLE_EVT = 'joker_chat_message';
const EMOJI_EVT = 'emoji_shown';
const NIGHT_NOTICE = '밤이 되었습니다';
const TOO_LONG = '메시지는 150자 이하로 입력해주세요.';
const OFFLINE = '인터넷 연결이 끊겨 보내지 못했습니다. 연결되면 다시 보내 주세요.';
// 말풍선 바탕색 (카톡형 결정: 같은 직업 = 붉은색, 죽은 사람 = 회색)
const RED_OTHER = 'rgb(74, 20, 20)';
const GRAY_MINE = 'rgb(90, 90, 90)';
// 폰 가로 (칸 배치: 채팅 칸 안에 입력 줄)
const LANDSCAPE = { width: 812, height: 375 };
const PORTRAIT = { width: 375, height: 812 };

// 자동 구성 판의 봇 자리 직업 (나 = 시민일 때): 6명부터 의사, 8명부터 경비원
const FIVE = ['JOKER', 'CITIZEN', 'CITIZEN', 'CITIZEN'];
const SIX = ['JOKER', 'DOCTOR', 'CITIZEN', 'CITIZEN', 'CITIZEN'];
const SEVEN = ['JOKER', 'DOCTOR', 'CITIZEN', 'CITIZEN', 'CITIZEN', 'CITIZEN'];
const EIGHT = ['JOKER', 'DOCTOR', 'GUARD', 'CITIZEN', 'CITIZEN', 'CITIZEN', 'CITIZEN'];

// 시험마다 다른 글 (다른 시험 채팅과 안 섞이게)
const uniq = (prefix) => `${prefix}${Math.random().toString(36).slice(2, 7)}`;

// 봇이 받은 알림 보기: 그 글이 어떤 알림으로든 왔는지 / 그 알림으로 올 때까지 기다림
const heardAny = (bot, text) => bot.events.some((r) => r.payload?.text === text);
const hears = (bot, event, text) => bot.waitForEvent(event, { match: (p) => p?.text === text });
// 앞서 보낸 알림이 봇에 다 닿았는지: 같은 소켓으로 묻고 답을 받음 (소켓 하나 안에서는 순서가 지켜져 고정 쉬기 없이 "안 옴"을 봄)
const settle = (t, bots = t.bots) => Promise.all(bots.map((b) => b.snapshot(t.gameId)));

const tribunalChat = (page) => page.getByRole('region', { name: '최후의 반론 채팅' });
const wideChat = (page) => page.getByRole('complementary', { name: '채팅' });
const talkSlot = (page) => page.locator('[data-talk-layout] [data-slot="chat"]');
// 말풍선 글 칸 (줄 안의 글 한 덩어리)
const bubble = (line) => line.locator('p.whitespace-pre-wrap');

/** 조건에 맞는 봇만 (서버 판 값 기준) → 예: 산 광대 봇 */
async function pick(t, match) {
    const s = await t.state();
    return t.bots.filter((b) => match(s.players.find((p) => p.uuid === b.account.uuid)));
}

/**
 * 판 차리기: 사람 1 + 봇, 직업을 전부 정하고 서버 값으로 한 번 확인 → 역할 확인 창 닫음
 * counts를 주면 직접 구성(예: { JOKER: 1, DOCTOR: 2 }), 안 주면 자동 구성
 */
async function seat(table, user, { role = 'CITIZEN', botRoles, counts = null }) {
    const t = await table.setup({
        humans: [user],
        bots: botRoles.length,
        settings: counts ? customRoleSettings(counts, SLOW) : { ...SLOW },
        roles: ({ bots }) => ({
            [user.account.uuid]: role,
            ...Object.fromEntries(bots.map((b, i) => [b.account.uuid, botRoles[i]])),
        }),
    });
    const s = await t.state();
    const roleOf = (uuid) => s.players.find((p) => p.uuid === uuid)?.role;
    expect(roleOf(user.account.uuid), '사람 직업').toBe(role);
    t.bots.forEach((b, i) => expect(roleOf(b.account.uuid), `봇 ${i} 직업`).toBe(botRoles[i]));
    await ui.readRoleReveal(user.page);
    return t;
}

/** 연출·안내 창을 닫아 가며 입력 줄을 쓸 수 있을 때까지 (밤 암살 영상이 멈춰 있으면 그 창의 단추) */
async function ready(page) {
    await expect(async () => {
        const stuck = page.locator('[data-ingame-night-success-kill] button').first();
        if (await stuck.isVisible().catch(() => false)) await stuck.click({ timeout: 1000 }).catch(() => {});
        await m.clearOverlays(page);
        expect(await talk.input(page).evaluate((el) => !el.closest('[inert]'), null, { timeout: 1000 })).toBe(true);
    }).toPass({ timeout: 40000 });
}

/**
 * 밤 시민이 글을 쳐서 보내 봄 → 어느 봇에게도 안 감 (모바일은 입력 줄을 닫지 않고 까닭 글도 없음, 막는 건 채팅 세션·서버)
 * scope: 입력 줄이 있는 칸 (크게 보기 시트 등), 기본은 화면 전체
 */
async function nightCitizenSendsNothing(t, page, scope = page) {
    // 크게 보기 시트가 열려 있으면 입력 줄이 둘(판 채팅 칸·시트) → 화면 전체 입력 줄을 보는 ready 대신 연출 창만 닫음
    if (scope === page) await ready(page);
    else await m.clearOverlays(page);
    const text = uniq('밤시민');
    const input = scope.getByRole('textbox', { name: '채팅 입력' }).first();
    await input.fill(text);
    await input.press('Enter');
    // 서버가 받았다면 봇에게 갈 만큼 기다린 뒤 봄 (봇마다 같은 소켓으로 묻고 답 받기)
    await m.sleep(1000);
    await settle(t);
    for (const b of t.bots) expect(heardAny(b, text), `봇 ${b.nickname}이 밤 시민 글을 받음`).toBe(false);
}

/** 늦게 뜬 안내 창이 가릴 수 있음 → 창을 닫아 가며 진짜 읽히는지 */
async function readableOnScreen(page, locator, o = {}) {
    await expect(async () => {
        await m.clearOverlays(page);
        await expectReadable(locator, { timeout: 1500, ...o });
    }).toPass({ timeout: 45000 });
}

/** 채팅방에서 말하기 (입력 줄이 풀린 뒤) */
async function say(page, text) {
    await ready(page);
    await m.say(page, text);
}

/** 봇 표로 한 사람을 재판에 세움 (사람은 안 내서 기권으로 셈) → 표 낸 봇들 */
async function toTribunal(t, defendantUuid) {
    await t.assertBotsCanExecute(defendantUuid);
    await t.advanceUntil('DAY_VOTE');
    const voters = await pick(t, (p) => p.alive && p.uuid !== defendantUuid);
    await day.botsVote(t, defendantUuid, voters);
    const s = await day.resolveVote(t);
    expect(s.phase, '봇 표로 재판이 열려야 함').toBe('TRIBUNAL');
    return voters;
}

/** 봇 표로 한 사람을 재판에서 판정 (유죄면 처형, 무죄면 살아서 밤) */
async function judge(t, uuid, verdict) {
    const voters = await toTribunal(t, uuid);
    await day.botsTribunal(t, verdict, voters);
    await day.resolveTribunal(t);
    const dead = verdict === 'GUILTY';
    await day.waitState(t, (s) => (s.players.find((p) => p.uuid === uuid)?.alive === false) === dead && s.phase !== 'TRIBUNAL');
}

/** 처형된 내 화면: 연출 뒤에 뜨는 "사망 후 선택"에서 관전 계속하기 (앞 연출·안내 창이 잠깐 가려 여러 번 봄) */
async function keepWatching(page) {
    const dialog = talk.deadChoice(page);
    await expect(dialog).toBeVisible({ timeout: 30000 });
    await expect(async () => {
        await m.clearOverlays(page, { keepWatching: false });
        if (await dialog.isVisible()) await dialog.getByRole('button', { name: '관전 계속하기' }).click({ timeout: 2000 });
        await expect(dialog).toBeHidden({ timeout: 1000 });
    }).toPass({ timeout: 45000 });
}

/** 1일 재판으로 내가 처형됨 → 관전 계속하기까지 (그 밤) */
async function getExecuted(t, user) {
    await judge(t, user.account.uuid, 'GUILTY');
    await keepWatching(user.page);
}

/** 내 카드 칸을 누르고 있기 (뗄 때는 page.mouse.up) — 앱은 0.45초 대고 있으면 팔레트를 엶 (넓은 배치 카드 판) */
async function holdMySlot(page) {
    // 모바일(상대 화면)은 이모티콘 팔레트가 넓은 배치 카드 판(내 칸 길게 누름)에만 있음 → 폰 가로로 돌려 둠
    if (!(await talk.board(page).isVisible().catch(() => false))) await m.useWideBoard(page);
    // 카드 판 안에서 내 칸이 화면 밖일 수 있음 → 먼저 끌어옴
    await talk.mySlot(page).scrollIntoViewIfNeeded();
    const box = await talk.mySlot(page).boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
}

/** 내 초상을 길게 눌러 팔레트를 열고 손을 뗌 */
async function openPalette(page) {
    await holdMySlot(page);
    await expect(talk.palette(page)).toBeVisible();
    await page.mouse.up();
}

/** 폰 가로(칸 배치)에는 단계 줄이 없음 → "밤이 되었습니다" 창으로 화면이 밤까지 따라온 것을 확인 (늦게 뜬 낮 창은 닫아 가며) */
async function wideToNight(t, page) {
    await t.advanceUntil('NIGHT');
    const notice = page.getByRole('dialog', { name: '단계 전환 안내' });
    await expect(async () => {
        if (await notice.isVisible().catch(() => false)) {
            const said = await notice.innerText().catch(() => '');
            if (!said.includes(NIGHT_NOTICE)) await notice.getByRole('button', { name: '확인' }).click({ timeout: 1000 }).catch(() => {});
        }
        await expect(notice).toContainText(NIGHT_NOTICE, { timeout: 1000 });
    }).toPass({ timeout: 30000 });
    await m.clearOverlays(page);
}

test('A06-E-131 밤 의사 (6명 판 직접 의사 2): 의사 봇 밤 글이 붉은 말풍선으로 보임 @game @safari @smoke', async ({ user, table }) => {
    const t = await seat(table, user, { role: 'DOCTOR', botRoles: ['JOKER', 'DOCTOR', 'CITIZEN', 'CITIZEN', 'CITIZEN'], counts: { JOKER: 1, DOCTOR: 2 } });
    const page = user.page;
    await m.toNight(t, page);
    await ready(page);

    const text = uniq('의사봇말');
    expect((await m.botNightSay(t, 1, text))?.ok).toBe(true);
    const line = talk.others(page).filter({ hasText: text });
    await expect(line).toBeVisible();
    expect(await m.bgColor(bubble(line))).toBe(RED_OTHER);
});

test('A06-E-132 밤 시민 (6명 판): 글을 쳐서 보내도 어느 봇에게도 안 감 @game @safari', async ({ user, table }) => {
    const t = await seat(table, user, { botRoles: SIX });
    const page = user.page;
    await m.toNight(t, page);
    await nightCitizenSendsNothing(t, page);
});

test('A06-E-133 처형된 뒤 (8명 판): "죽은 사람끼리" 띠가 읽힘 @game', async ({ user, table }) => {
    const t = await seat(table, user, { botRoles: EIGHT });
    const page = user.page;
    await getExecuted(t, user);
    await readableOnScreen(page, talk.deadBanner(page));
});

// 합친 뒤 세로 카톡형: 재판 창 안 "최후의 반론 채팅" 칸이 없어짐 → 고발 연출 뒤 채팅방·바닥 입력 줄 그대로 말함 (frontend-mobile talk/TalkLayout.jsx)
test('A06-E-134 재판 중 (6명 판): 고발 연출 뒤 채팅방이 그대로 보이고 바닥 입력 줄로 보내면 봇 전원이 받음 @game', async ({ user, table }) => {
    const t = await seat(table, user, { botRoles: SIX });
    const page = user.page;
    await m.toDay(t, page);
    await ready(page);
    await toTribunal(t, t.bots[4].account.uuid);

    await m.waitTrialTalk(page);
    // 재판 중에도 채팅방은 숨지 않음, 옛 재판 창 채팅 칸은 없음
    await expect(talkSlot(page)).not.toHaveClass(/invisible/);
    await expect(talk.log(page)).toBeVisible();
    await expect(tribunalChat(page)).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: '채팅 입력' })).toHaveCount(1);

    const text = uniq('반론');
    await m.say(page, text);
    await Promise.all(t.bots.map((b) => hears(b, DAY_EVT, text)));
});

test('A06-E-135 재판 끝 뒤 (6명 판): 봇이 처형되면 재판 창이 닫히고 채팅방에 그 알림 줄이 남음 @game', async ({ user, table }) => {
    const t = await seat(table, user, { botRoles: SIX });
    const page = user.page;
    await m.toDay(t, page);
    await ready(page);
    const victim = t.bots[4];
    await judge(t, victim.account.uuid, 'GUILTY');

    await expect(tribunalChat(page)).toBeHidden({ timeout: 30000 });
    await expect(talkSlot(page)).not.toHaveClass(/invisible/, { timeout: 30000 });
    // 재판 동안 채팅방이 숨어 있었어도 그사이 생긴 처형 알림 줄은 남아 있음
    const notice = talk.system(page).filter({ hasText: `${victim.nickname}님이 죽었습니다` });
    await readableOnScreen(page, notice.locator('p'));
});

test('A06-E-136 재판 중 151자 (6명 판): 채팅방 입력 줄 아래 오류 글이 읽히고 봇 0 @game', async ({ user, table }) => {
    const t = await seat(table, user, { botRoles: SIX });
    const page = user.page;
    await m.toDay(t, page);
    await ready(page);
    await toTribunal(t, t.bots[4].account.uuid);

    // 재판 중 말은 채팅방 바닥 입력 줄로 (A06-E-134와 같은 배치)
    await m.waitTrialTalk(page);
    const text = `${uniq('긴글')}${'가'.repeat(151)}`.slice(0, 151);
    await talk.input(page).fill(text);
    await talk.send(page).click();
    const alert = talk.chat(page).getByRole('alert');
    await expect(alert).toHaveText(TOO_LONG);
    await expectReadable(alert);
    await expect(talk.log(page)).not.toContainText(text);
    await settle(t);
    for (const b of t.bots) expect(heardAny(b, text), `봇 ${b.nickname}이 151자 글을 받음`).toBe(false);
});

test('A06-E-137 채팅방 151자 (5명 판): 오류 글이 읽히고 봇 0 @game', async ({ user, table }) => {
    const t = await seat(table, user, { botRoles: FIVE });
    const page = user.page;
    await m.toDay(t, page);
    await ready(page);

    const text = `${uniq('긴글')}${'가'.repeat(151)}`.slice(0, 151);
    await talk.input(page).fill(text);
    await talk.send(page).click();
    const alert = talk.chat(page).getByRole('alert');
    await expect(alert).toHaveText(TOO_LONG);
    await expectReadable(alert);
    await expect(talk.mine(page)).toHaveCount(0);
    await settle(t);
    for (const b of t.bots) expect(heardAny(b, text), `봇 ${b.nickname}이 151자 글을 받음`).toBe(false);
});

test('A06-E-138 0.5초 안 두 번 (5명 판): 0.3초 간격으로 두 글을 보내면 봇은 첫 글 한 줄만 받음 @game @realtime', async ({ user, table }) => {
    const t = await seat(table, user, { botRoles: FIVE });
    const page = user.page;
    await m.toDay(t, page);
    await ready(page);

    const first = uniq('첫글');
    const second = uniq('둘째글');
    const input = talk.input(page);
    await input.fill(first);
    await talk.send(page).click();
    const firstAt = Date.now();
    // 서버가 첫 글을 받으면 입력 줄이 비워짐 → 그 뒤 둘째 글을 써 두고 0.3초에 맞춰 보냄 (진짜 시간 간격을 보는 케이스)
    await expect(input).toHaveValue('');
    await input.fill(second);
    await page.waitForTimeout(Math.max(0, 300 - (Date.now() - firstAt)));
    await talk.send(page).click();
    expect(Date.now() - firstAt, '두 글 사이가 0.5초를 넘으면 이 케이스가 아님').toBeLessThan(480);

    // 첫 글에서 0.65초 뒤 표지 글: 거절된 글은 간격을 안 먹어서 나가고, 표지가 봇에 오면 그 앞에 보낸 둘째 글 처리도 끝난 것
    await page.waitForTimeout(Math.max(0, 650 - (Date.now() - firstAt)));
    const mark = uniq('표지');
    await m.say(page, mark);
    await Promise.all(t.bots.map((b) => hears(b, DAY_EVT, mark)));
    for (const b of t.bots) {
        const mine = b.events.filter((r) => r.event === DAY_EVT && r.payload?.senderUuid === user.account.uuid).map((r) => r.payload.text);
        expect(mine).toEqual([first, mark]);
    }
    await expect(talk.mine(page).filter({ hasText: second })).toHaveCount(0);
});

test('A06-E-139 금지어 (5명 판): 금지어가 든 글을 보내면 봇이 받은 글은 같은 길이 *로 가려짐 @game', async ({ user, table }) => {
    // 낱말은 시험마다 무작위 (금지어 표는 서버 전체가 같이 써서 다른 시험 채팅에 안 걸리게)
    const word = `금칙${Math.floor(Math.random() * 1e8)}`;
    await bannedWords.addBannedWords([word]);
    try {
        const t = await seat(table, user, { botRoles: FIVE });
        const page = user.page;
        await m.toDay(t, page);
        await ready(page);

        const head = uniq('너');
        await talk.input(page).fill(`${head} ${word}`);
        await talk.send(page).click();
        const masked = `${head} ${'*'.repeat(word.length)}`;
        await Promise.all(t.bots.map((b) => hears(b, DAY_EVT, masked)));
        for (const b of t.bots) expect(heardAny(b, `${head} ${word}`), '가려지기 전 글이 봇에 감').toBe(false);
        // 내 화면 말풍선도 가려진 글
        await expect(bubble(talk.mine(page).filter({ hasText: head }))).toHaveText(masked);
    } finally {
        await bannedWords.removeBannedWords([word]);
    }
});

test('A06-E-140 스크립트 글 (5명 판): 봇이 <img onerror> 글을 보내면 글자 그대로 보이고 대화 상자가 안 뜸 @game', async ({ user, table }) => {
    const t = await seat(table, user, { botRoles: FIVE });
    const page = user.page;
    const dialogs = [];
    page.on('dialog', (dialog) => { dialogs.push(dialog.message()); dialog.dismiss().catch(() => {}); });
    await m.toDay(t, page);
    await ready(page);

    const payload = '<img src=x onerror=alert(1)>';
    expect((await m.botSay(t, 1, payload))?.ok).toBe(true);
    const line = talk.others(page).filter({ hasText: payload });
    await expect(bubble(line)).toHaveText(payload);
    await expectReadable(bubble(line));
    // 글이 그림 요소로 바뀌지 않음 (초상 그림은 따로 있어서 끼워 넣은 주소만 봄)
    await expect(line.locator('img[src="x"]')).toHaveCount(0);
    await expect(page.locator('img[src="x"]')).toHaveCount(0);
    expect(dialogs).toEqual([]);
});

test('A06-E-141 인터넷 끊김 (5명 판): 끊긴 채 보내면 끊김 문구가 읽히고 말풍선이 안 생김 @game', async ({ user, table }) => {
    const t = await seat(table, user, { botRoles: FIVE });
    const page = user.page;
    await m.toDay(t, page);
    await ready(page);

    const text = uniq('끊김중');
    await user.context.setOffline(true);
    try {
        await talk.input(page).fill(text);
        await talk.input(page).press('Enter');
        const alert = talk.chat(page).getByRole('alert');
        await expect(alert).toHaveText(OFFLINE);
        await expectReadable(alert);
        await expect(talk.mine(page).filter({ hasText: text })).toHaveCount(0);
    } finally {
        await user.context.setOffline(false);
    }
});

test('A06-E-142 역할 확인 중 보냄 (5명 판): 입장 준비 덮개가 화면을 덮고, 글을 치고 엔터를 쳐도 봇 0 @game', async ({ user, table }) => {
    const t = await seat(table, user, { botRoles: FIVE });
    const page = user.page;
    const text = uniq('확인중');
    const input = talk.input(page);
    // 역할 확인 10초 동안: 모바일(상대 화면)은 입력 줄을 끄지 않고 입장 준비 덮개가 화면 전체를 덮음 (frontend-mobile overlays/EntryPreparingOverlay.jsx)
    await expect(page.locator('[data-ingame-entry-preparing]'), '역할 확인 중 입장 준비 덮개').toBeVisible({ timeout: 3000 });
    // 그래도 덮개 너머로 억지로 쳐 봄 (막혀도 기다리지 않게 짧게)
    await input.fill(text, { force: true, timeout: 1000 }).catch(() => {});
    await input.press('Enter', { timeout: 1000 }).catch(() => {});
    // 역할 확인 10초는 손잡이로 안 넘김 → 엔터를 친 때가 아직 그 10초 안이어야 이 케이스를 본 것
    expect((await t.state()).phase).toBe('ROLE_REVEAL');

    // 첫 낮에 표지 글을 보내 봇이 받게 함: 내 소켓에서 표지보다 먼저 나간 글이 있었다면 봇에 이미 와 있음
    await m.toDay(t, page);
    const mark = uniq('표지');
    await say(page, mark);
    await Promise.all(t.bots.map((b) => hears(b, DAY_EVT, mark)));
    for (const b of t.bots) expect(heardAny(b, text), `봇 ${b.nickname}이 역할 확인 중 글을 받음`).toBe(false);
    await expect(talk.log(page)).not.toContainText(text);
});

// 역할 확인 10초도 "낮에만"에 들어감 (결정 셋째 장 "반장이 정하고 알린 것" 1) — 화면은 팔레트를 안 열고 서버는 INVALID_PHASE로 거절
test('A06-E-143 역할 확인 중 이모티콘 안 됨 (6명 판): 내 초상을 길게 눌러도 팔레트가 안 뜨고 봇이 받은 이모티콘 0, 낮이 되면 팔레트가 뜸 (결정: 이모티콘은 낮에만) @game', async ({ user, table }) => {
    const t = await seat(table, user, { botRoles: SIX });
    const page = user.page;
    // 길게 누르기 0.45초 규칙만큼 진짜로 누르고 있음 → 역할 확인 동안은 팔레트가 안 뜸
    await holdMySlot(page);
    await page.waitForTimeout(700);
    await page.mouse.up();
    await expect(talk.palette(page)).toHaveCount(0);
    // 봇이 서버로 바로 보내도 거절됨
    const reply = await t.bots[1].request('send_emoji', { gameId: t.gameId, itemId: BASIC_EMOJI.hello.id });
    expect([reply?.ok, reply?.code], '역할 확인 중 봇 이모티콘 답').toEqual([false, 'INVALID_PHASE']);
    // 역할 확인 10초는 손잡이로 안 넘김 → 여기까지가 아직 그 10초 안이어야 이 케이스를 본 것
    expect((await t.state()).phase).toBe('ROLE_REVEAL');
    await settle(t);
    for (const b of t.bots) expect(b.events.filter((r) => r.event === EMOJI_EVT)).toHaveLength(0);
    await expect(talk.log(page).locator('[data-talk-emoji]')).toHaveCount(0);

    // 낮이 되면 같은 길게 누르기로 팔레트가 뜸 (막힌 까닭이 단계였다는 표시)
    await m.toDay(t, page);
    await ready(page);
    await openPalette(page);
});
test('A06-E-144 내 칸 길게 누르기 (5명 판): 내 초상을 0.45초 넘게 누르고 있으면 이모티콘 팔레트가 보임 @game @safari', async ({ user, table }) => {
    const t = await seat(table, user, { botRoles: FIVE });
    const page = user.page;
    await m.toDay(t, page);
    await ready(page);

    await holdMySlot(page);
    await expect(talk.palette(page)).toBeVisible();
    await page.mouse.up();
    // 팔레트는 그림 판이라 대비는 못 셈 → 보임·화면 안·안 가려짐, 칸 단추는 누를 수 있음
    await expectReadable(talk.palette(page), { contrast: false });
    await expect(talk.palette(page).getByRole('button', { name: `${BASIC_EMOJI.hello.name} 보내기` })).toBeEnabled();
});

test('A06-E-145 받은 이모티콘 (5명 판): 봇이 보내면 채팅방에 큰 이모티콘 줄 @game', async ({ user, table }) => {
    const t = await seat(table, user, { botRoles: FIVE });
    const page = user.page;
    await m.toDay(t, page);
    await ready(page);

    const sender = t.bots[1];
    const reply = await sender.request('send_emoji', { gameId: t.gameId, itemId: BASIC_EMOJI.tears.id });
    expect(reply?.ok).toBe(true);
    // 세로 카톡형엔 초상 띠가 없음(카드 판은 넓은 배치에만) → 채팅방 줄로만 봄
    // 채팅방 줄은 계속 남음: 말풍선 틀 없이 큰 이모티콘 + 보낸 봇 닉네임
    const line = talk.others(page).filter({ has: page.locator(`[data-talk-emoji="${BASIC_EMOJI.tears.id}"]`) });
    await expectReadable(line.locator('[data-talk-emoji]'), { contrast: false });
    await expect(line).toContainText(sender.nickname);
});

test('A06-E-146 죽은 사람 이모티콘 (8명 판): 처형된 뒤 내 초상을 길게 눌러도 봇이 받은 이모티콘 0 @game', async ({ user, table }) => {
    test.setTimeout(180_000);
    const t = await seat(table, user, { botRoles: EIGHT });
    const page = user.page;
    await getExecuted(t, user);
    // 이모티콘은 낮에만이라 다음 낮까지 감 (밤이라서 막힌 것과 죽어서 막힌 것을 가르려고)
    await m.goPhase(t, page, 'DAY', { line: '낮' });
    await ready(page);

    // 길게 누르기 0.45초 규칙만큼 진짜로 누르고 있음
    await holdMySlot(page);
    await page.waitForTimeout(700);
    await page.mouse.up();
    const pickHello = talk.palette(page).getByRole('button', { name: `${BASIC_EMOJI.hello.name} 보내기` });
    if (await pickHello.isVisible().catch(() => false)) await pickHello.click();

    await settle(t);
    for (const b of t.bots) {
        expect(b.events.filter((r) => r.event === EMOJI_EVT && r.payload?.uuid === user.account.uuid)).toHaveLength(0);
    }
    await expect(talk.mySlot(page).locator('[data-ingame-emoji-bubble]')).toHaveCount(0);
});

test('A06-E-147 새로고침 뒤 밤 시민 (6명 판): 밤에 새로고침해도 밤 화면이 이어지고, 보내도 어느 봇에게도 안 감 @game @safari', async ({ user, table }) => {
    const t = await seat(table, user, { botRoles: SIX });
    const page = user.page;
    await m.toNight(t, page);

    await page.reload();
    await expect(talk.layout(page)).toBeVisible({ timeout: 20000 });
    await expect(talk.phaseLine(page)).toContainText('[밤', { timeout: 20000 });
    await nightCitizenSendsNothing(t, page);
});

test('A06-E-148 새로고침 뒤 채팅방 (5명 판): 말 2줄은 남고 이모티콘 줄은 사라짐 @game', async ({ user, table }) => {
    const t = await seat(table, user, { botRoles: FIVE });
    const page = user.page;
    await m.toDay(t, page);

    const mine = uniq('내말');
    const theirs = uniq('봇말');
    await say(page, mine);
    expect((await m.botSay(t, 1, theirs))?.ok).toBe(true);
    expect((await m.botEmoji(t, 2, BASIC_EMOJI.love.id))?.ok).toBe(true);
    await expect(talk.others(page).filter({ hasText: theirs })).toBeVisible();
    await expect(talk.log(page).locator(`[data-talk-emoji="${BASIC_EMOJI.love.id}"]`)).toBeVisible();

    await page.reload();
    await expect(talk.layout(page)).toBeVisible({ timeout: 20000 });
    await ready(page);
    await expect(talk.mine(page).filter({ hasText: mine })).toBeVisible();
    await expect(talk.others(page).filter({ hasText: theirs })).toBeVisible();
    await expect(talk.log(page).locator('[data-talk-emoji]')).toHaveCount(0);
});

test('A06-E-149 세로 → 가로 → 세로 (5명 판): 화면을 돌려도 말과 이모티콘 줄이 남음 @game', async ({ user, table }) => {
    const t = await seat(table, user, { botRoles: FIVE });
    const page = user.page;
    await m.toDay(t, page);

    const mine = uniq('돌리기전');
    await say(page, mine);
    expect((await m.botEmoji(t, 1, BASIC_EMOJI.love.id))?.ok).toBe(true);
    const emojiLine = talk.log(page).locator(`[data-talk-emoji="${BASIC_EMOJI.love.id}"]`);
    await expect(emojiLine).toBeVisible();

    // 가로(칸 배치)에서는 말이 채팅 칸에 그대로
    await page.setViewportSize(LANDSCAPE);
    await expect(talk.layout(page)).toHaveCount(0);
    await expect(wideChat(page).getByRole('log', { name: '채팅 내역' })).toContainText(mine);

    // 다시 세로(카톡형): 말풍선과 이모티콘 줄 둘 다 남아 있음
    await page.setViewportSize(PORTRAIT);
    await expectReadable(bubble(talk.mine(page).filter({ hasText: mine })));
    await expectReadable(emojiLine, { contrast: false });
});

test('A06-E-150 폰 가로 밤 시민 (6명 판): 가로 배치에서 보내도 어느 봇에게도 안 감 @game', async ({ user, table }) => {
    await user.page.setViewportSize(LANDSCAPE);
    const t = await seat(table, user, { botRoles: SIX });
    const page = user.page;
    await m.toDay(t, page, { line: undefined });
    await wideToNight(t, page);
    await expect(talk.layout(page)).toHaveCount(0);
    await nightCitizenSendsNothing(t, page, wideChat(page));
});

test('A06-E-151 폰 가로 밤 의사 (6명 판 직접 의사 2): 가로 배치에서 보내면 의사 봇만 받음 @game', async ({ user, table }) => {
    await user.page.setViewportSize(LANDSCAPE);
    const t = await seat(table, user, { role: 'DOCTOR', botRoles: ['JOKER', 'DOCTOR', 'CITIZEN', 'CITIZEN', 'CITIZEN'], counts: { JOKER: 1, DOCTOR: 2 } });
    const page = user.page;
    await m.toDay(t, page, { line: undefined });
    await wideToNight(t, page);
    await ready(page);

    const text = uniq('가로의사');
    await talk.input(page).fill(text);
    await talk.send(page).click();
    await expect(wideChat(page).getByRole('log', { name: '채팅 내역' })).toContainText(text);
    await hears(t.bots[1], ROLE_EVT, text);
    const others = t.bots.filter((b) => b !== t.bots[1]);
    await settle(t, others);
    for (const b of others) expect(heardAny(b, text), `의사가 아닌 봇 ${b.nickname}이 받음`).toBe(false);
});

test('A06-E-152 죽은 광대 밤 (7명 판 직접 광대 2): 산 광대 봇 글은 붉은 말풍선으로 보이고 내 글은 회색 @game', async ({ user, table }) => {
    test.setTimeout(180_000);
    const t = await seat(table, user, { role: 'JOKER', botRoles: ['JOKER', 'CITIZEN', 'CITIZEN', 'CITIZEN', 'CITIZEN', 'CITIZEN'], counts: { JOKER: 2 } });
    const page = user.page;
    await getExecuted(t, user);
    await expect(talk.phaseLine(page)).toContainText('밤', { timeout: 20000 });
    await ready(page);

    // 죽은 광대는 광대 밤 채팅을 읽기만 함
    const theirs = uniq('산광대말');
    expect((await m.botNightSay(t, 0, theirs))?.ok).toBe(true);
    const theirLine = talk.others(page).filter({ hasText: theirs });
    await expect(theirLine).toBeVisible();
    expect(await m.bgColor(bubble(theirLine))).toBe(RED_OTHER);

    // 내가 쓰면 죽은 사람 채팅 (회색), 산 광대 봇은 못 받음
    const mine = uniq('죽은광대말');
    await say(page, mine);
    expect(await m.bgColor(bubble(talk.mine(page).filter({ hasText: mine })))).toBe(GRAY_MINE);
    await settle(t, [t.bots[0]]);
    expect(heardAny(t.bots[0], mine), '산 광대 봇이 죽은 광대 글을 받음').toBe(false);
});

test('A06-E-153 직업 혼자 (5명 판 광대 1): 밤에 보내면 내 글이 내 채팅방에 보이고 봇 0 @game', async ({ user, table }) => {
    const t = await seat(table, user, { role: 'JOKER', botRoles: ['CITIZEN', 'CITIZEN', 'CITIZEN', 'CITIZEN'] });
    const page = user.page;
    await m.toNight(t, page);
    const text = uniq('혼잣말');
    await say(page, text);
    await expectReadable(bubble(talk.mine(page).filter({ hasText: text })));
    await settle(t);
    for (const b of t.bots) expect(heardAny(b, text), `시민 봇 ${b.nickname}이 광대 글을 받음`).toBe(false);
});

test('A06-E-154 내 글 오른쪽·남 글 왼쪽 (5명 판): 낮 토론에서 내 말풍선은 오른쪽, 봇 말풍선은 왼쪽 @game', async ({ user, table }) => {
    const t = await seat(table, user, { botRoles: FIVE });
    const page = user.page;
    await m.toDay(t, page);

    const mine = uniq('내말');
    const theirs = uniq('봇말');
    await say(page, mine);
    expect((await m.botSay(t, 1, theirs))?.ok).toBe(true);
    const mineBox = await bubble(talk.mine(page).filter({ hasText: mine })).boundingBox();
    const theirBubble = bubble(talk.others(page).filter({ hasText: theirs }));
    await expect(theirBubble).toBeVisible();
    const theirBox = await theirBubble.boundingBox();
    const middle = page.viewportSize().width / 2;
    expect(mineBox.x + mineBox.width / 2).toBeGreaterThan(middle);
    expect(theirBox.x + theirBox.width / 2).toBeLessThan(middle);
});

test('A06-E-155 둘째 밤 시민 (7명 판): 2일 밤에도 보내면 어느 봇에게도 안 감 @game', async ({ user, table }) => {
    const t = await seat(table, user, { botRoles: SEVEN });
    const page = user.page;
    const firstNight = await m.toNight(t, page);

    await m.goPhase(t, page, (s) => s.phase === 'DAY' && s.dayIndex > firstNight.dayIndex, { line: '낮' });
    await ready(page);
    await m.goPhase(t, page, (s) => s.phase === 'NIGHT' && s.dayIndex > firstNight.dayIndex, { line: '밤' });
    await expect(talk.phaseLine(page)).toContainText('[밤');
    await nightCitizenSendsNothing(t, page);
});

test('A06-E-156 좁은 화면 입력 (5명 판, 높이 560): 글칸을 눌러 입력하는 동안 입력 줄이 화면 안에서 읽힘 @game', async ({ user, table }) => {
    const t = await seat(table, user, { botRoles: FIVE });
    const page = user.page;
    await m.toDay(t, page);
    await ready(page);

    await page.setViewportSize({ width: 375, height: 560 });
    await talk.input(page).click();
    await talk.input(page).fill(uniq('좁은화면'));
    // 낮은 화면에서 입력 중이면 띠·진행 바를 접어 자리를 냄
    await expect(page.locator('[data-compact-typing]')).toHaveCount(1);
    await expectReadable(talk.input(page));
    await expectReadable(talk.send(page), { contrast: false });
});

test('A06-E-157 죽은 사람도 낮 말을 읽음 (8명 판): 처형된 뒤 산 봇의 낮 채팅이 내 채팅방에 보임 @game', async ({ user, table }) => {
    test.setTimeout(180_000);
    const t = await seat(table, user, { botRoles: EIGHT });
    const page = user.page;
    await getExecuted(t, user);
    await m.goPhase(t, page, 'DAY', { line: '낮' });
    await ready(page);

    const text = uniq('산봇낮말');
    expect((await m.botSay(t, 3, text))?.ok).toBe(true);
    await expectReadable(bubble(talk.others(page).filter({ hasText: text })));
});

test('A06-E-158 밤 → 낮 (6명 판 사람 의사): 밤에 쓴 글은 낮 채팅방에 안 섞임 @game', async ({ user, table }) => {
    const t = await seat(table, user, { role: 'DOCTOR', botRoles: ['JOKER', 'CITIZEN', 'CITIZEN', 'CITIZEN', 'CITIZEN'] });
    const page = user.page;
    const night = await m.toNight(t, page);
    const nightText = uniq('밤의말');
    await say(page, nightText);

    await m.goPhase(t, page, (s) => s.phase === 'DAY' && s.dayIndex > night.dayIndex, { line: '낮' });
    await ready(page);
    // 낮 표지 글이 보일 만큼 화면이 낮을 따라온 뒤에도 밤 글이 없음
    const dayText = uniq('낮의말');
    expect((await m.botSay(t, 1, dayText))?.ok).toBe(true);
    await expect(talk.others(page).filter({ hasText: dayText })).toBeVisible();
    await expect(talk.log(page)).not.toContainText(nightText);
});

test('A06-E-159 폰 가로 크게 보기 시트 (6명 판): 밤에 시트 입력 줄로 보내도 어느 봇에게도 안 감 @game', async ({ user, table }) => {
    await user.page.setViewportSize(LANDSCAPE);
    const t = await seat(table, user, { botRoles: SIX });
    const page = user.page;
    await m.toDay(t, page, { line: undefined });
    await ready(page);

    const openSheet = () => page.getByRole('button', { name: '채팅 크게 보기' }).click({ timeout: 2000 });
    await openSheet();
    const sheet = page.getByRole('dialog', { name: '채팅 클로즈업' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('textbox', { name: '채팅 입력' })).toBeVisible();

    // 단계 연출·밤 차례 안내가 뜨면 시트가 닫힘(결정 2026-11-16 판 화면 겹 창 닫기) → 안내를 넘긴 뒤 닫혀 있으면 다시 열어 봄
    await wideToNight(t, page);
    await expect(async () => {
        await m.clearOverlays(page);
        if (!(await sheet.isVisible().catch(() => false))) await openSheet();
        await expect(sheet.getByRole('textbox', { name: '채팅 입력' })).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 45_000 });
    await nightCitizenSendsNothing(t, page, sheet);
});

test('A06-E-160 무죄 → 밤 (7명 판): 재판이 무죄로 끝나 밤이 되면 의사 화면 명패가 밤이고 "최후의 변론" 단추가 사라짐 @game @safari', async ({ user, table }) => {
    const t = await seat(table, user, { role: 'DOCTOR', botRoles: ['JOKER', 'CITIZEN', 'CITIZEN', 'CITIZEN', 'CITIZEN', 'CITIZEN'] });
    const page = user.page;
    await m.toDay(t, page);
    await ready(page);

    const defendant = t.bots[5];
    await judge(t, defendant.account.uuid, 'NOT_GUILTY');
    expect((await t.player(defendant.account.uuid)).alive).toBe(true);
    expect((await t.state()).phase).toBe('NIGHT');

    await expect(talk.phaseLine(page)).toContainText('[밤', { timeout: 20000 });
    await expect(page.getByTestId('tribunal-presentation-open')).toHaveCount(0, { timeout: 20000 });
});
