'use strict';

// 역할 확인 단계 조작 브라우저 시험 (PC) — 채팅 막힘·이모티콘 됨·투표/준비 단추 없음·확인 뒤 판 안 가려짐·첫 낮 뒤 창 다시 안 뜸·역할 확인 중 나감
// 목록 A02-판시작-역할.md 번호 A02-E-089~097 — 10초 안에 볼 것은 판이 열리자마자, E-095는 20초를 진짜로 지켜봄
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { sleep } = require('../../helpers/wait');
const night = require('./b-night/_night');
const day = require('./a-day/_lib');
const { waitResult } = require('../room/roomHelpers');

const revealDialog = (page) => page.getByRole('dialog', { name: '내 역할 보기' });
const dayNotice = (page) => page.getByRole('dialog', { name: '단계 전환 안내' }).filter({ hasText: '낮이 되었습니다' });
// 기본 지급 이모티콘 (frontend store/constants/storeItems.js BASIC_EMOTICONS)
const HELLO = { id: 'emoji-basic-hello', name: '안녕' };

// 자동 구성대로 직업 고정, 사람은 시민 → 봇 줄 예: 6명 ['JOKER','DOCTOR','CITIZEN','CITIZEN','CITIZEN']
function autoBotRoles(n) {
    const special = ['JOKER', ...(n >= 6 ? ['DOCTOR'] : []), ...(n >= 8 ? ['GUARD'] : []), ...(n >= 10 ? ['WITCH_HUNTER'] : [])];
    return [...special, ...Array(n - 1 - special.length).fill('CITIZEN')];
}

async function openTable(table, user, n, botRoles = autoBotRoles(n)) {
    return night.setup(table, { humans: [user], bots: n - 1, humanRoles: ['CITIZEN'], botRoles });
}

// 역할 창 확인 눌러 닫기 (판 화면을 보려고)
async function closeReveal(page) {
    const dialog = revealDialog(page);
    await expect(dialog).toBeVisible({ timeout: 20_000 });
    await dialog.getByRole('button', { name: '확인' }).click();
    await expect(dialog).toBeHidden();
}

// 역할 확인 단계에서 본 것인지 (10초가 지나 낮이 됐으면 시험이 뜻을 잃음)
async function expectStillRoleReveal(t) {
    expect((await t.state()).phase, '아직 역할 확인 단계여야 함').toBe('ROLE_REVEAL');
}

// 봇이 받은 사건 시각 (없으면 null)
const eventAt = (bot, event) => bot.events.find((r) => r.event === event)?.at ?? null;

// 이모티콘 말풍선이 첫 낮 알림보다 먼저 나갔는지 (= 역할 확인 단계 안에서 나감), 지켜보는 봇 기준
async function expectEmojiBeforeFirstDay(watcher) {
    await expect.poll(() => eventAt(watcher, 'emoji_shown'), { message: '판 사람에게 이모티콘이 안 나감' }).not.toBeNull();
    const dayAt = eventAt(watcher, 'game_phase_changed') ?? Infinity;
    expect(eventAt(watcher, 'emoji_shown')).toBeLessThan(dayAt);
}

// 채팅을 못 쓰는지: 입력칸이 꺼짐(읽기만·inert 포함) 또는 보내기가 꺼짐
async function chatBlocked(page) {
    const input = page.getByRole('textbox', { name: '채팅 입력' });
    const send = page.getByRole('button', { name: '채팅 보내기' });
    await expect(input).toBeAttached();
    await expect(send).toBeAttached();
    const writable = await input.evaluate((el) => !el.disabled && !el.readOnly && !el.closest('[inert]'));
    const sendOn = await send.evaluate((el) => !el.disabled && !el.closest('[inert]'));
    return !writable || !sendOn;
}

// 말풍선 그림 (카드 위, 마우스를 안 받는 칸이라 가려짐 검사는 못 함 → 보임·크기·화면 안만)
const bubbleOn = (page, nickname) => night.cardButton(page, nickname).locator('[data-ingame-emoji-bubble]').getByRole('img', { name: HELLO.name });

// A02-E-089~090: 역할 확인 중 채팅 막힘 (모음 글 C-027: 지금은 입력칸이 켜져 있음)
for (const [no, n] of [[89, 5], [90, 8]]) {
    const smoke = no === 89 ? ' @smoke' : '';
    test(`A02-E-0${no} ${n}명 역할 확인 중 → 채팅 칸에 글이 안 써지거나 보내기 꺼짐 @game${smoke}`, async ({ user, table }) => {
        const t = await openTable(table, user, n);
        await closeReveal(user.page);
        expect(await chatBlocked(user.page), '역할 확인 중 채팅을 쓸 수 있음').toBe(true);
        await expectStillRoleReveal(t);
    });
}

test('A02-E-091 6명 역할 확인 중, 이모티콘 누름 → 내 카드 위 말풍선 보임 @game', async ({ user, table }) => {
    const page = user.page;
    const t = await openTable(table, user, 6);
    await closeReveal(page);
    // 내 카드 오른쪽 누름 → 이모티콘 팔레트 → 안녕
    await night.cardButton(page, user.account.nickname).click({ button: 'right' });
    const palette = page.getByRole('group', { name: '이모티콘 팔레트' });
    await palette.getByRole('button', { name: `${HELLO.name} 보내기` }).click();
    await expectReadable(bubbleOn(page, user.account.nickname), { contrast: false, uncovered: false });
    await expectEmojiBeforeFirstDay(t.bots[0]);
});

test('A02-E-092 7명 역할 확인 중, 봇이 이모티콘 → 내 화면 그 봇 카드 위 말풍선 @game', async ({ user, table }) => {
    const page = user.page;
    const t = await openTable(table, user, 7);
    await closeReveal(page);
    const sender = t.bots[1];
    const reply = await sender.request('send_emoji', { gameId: t.gameId, itemId: HELLO.id });
    expect(reply?.ok, `봇 이모티콘 거절: ${reply?.code}`).toBe(true);
    await expectReadable(bubbleOn(page, sender.nickname), { contrast: false, uncovered: false });
    await expectEmojiBeforeFirstDay(t.bots[0]);
});

test('A02-E-093 5명 역할 확인 중 → 투표·준비 단추 없음 @game', async ({ user, table }) => {
    const page = user.page;
    const t = await openTable(table, user, 5);
    await closeReveal(page);
    // 판 화면이 다 그려진 뒤에 봄 (안 그려져서 "없음"이 맞는 것 막기)
    await expect(page.locator('[data-ingame-player-nickname]')).toHaveCount(5);
    for (const name of ['투표 시작 준비', '준비 완료', '기권']) {
        await expect(page.getByRole('button', { name, exact: true }), name).toHaveCount(0);
    }
    await expect(page.locator('[data-ingame-phase-action="dayReady"], [data-ingame-phase-action="dayVoteAbstain"]')).toHaveCount(0);
    // 남의 카드를 눌러도 투표 항목 없음
    await night.cardButton(page, t.bots[0].nickname).click();
    await expect(page.getByRole('menuitem', { name: '투표하기' })).toHaveCount(0);
    await expectStillRoleReveal(t);
});

test('A02-E-094 6명, 확인 → 역할 창 사라짐, 판 카드가 안 가려지고 읽힘 @game', async ({ user, table }) => {
    const page = user.page;
    const t = await openTable(table, user, 6);
    await closeReveal(page);
    const nicknames = [user.account.nickname, ...t.bots.map((b) => b.nickname)];
    for (const nick of nicknames) await expectReadable(night.cardStatus(page, nick).getByText(nick, { exact: true }));
    await expectStillRoleReveal(t);
});

test('A02-E-095 5명, 첫 낮 뒤 20초 → 역할 창 다시 안 뜸 @game @realtime', async ({ user, table }) => {
    const page = user.page;
    const t = await openTable(table, user, 5);
    // 첫 낮까지는 손잡이로 (10초 규칙은 이 시험이 안 봄)
    await night.closeRoleReveal(page);
    await t.advanceUntil('DAY');
    await day.closeNotice(page, '낮이 되었습니다');
    // 20초 동안 0.25초마다 지켜봄 (뜨면 바로 실패)
    const until = Date.now() + 20_000;
    while (Date.now() < until) {
        expect(await revealDialog(page).isVisible(), '첫 낮 뒤 역할 창이 다시 뜸').toBe(false);
        await sleep(250);
    }
    expect((await t.state()).phase).toBe('DAY');
});

test('A02-E-096 6명 역할 확인 중, 봇 시민 1명 나감 → 그 카드 나감 표시, 낮으로 넘어감 @game', async ({ user, table }) => {
    const page = user.page;
    const roles = autoBotRoles(6);
    const t = await openTable(table, user, 6, roles);
    const leaver = t.bots[roles.indexOf('CITIZEN')];
    await expect(revealDialog(page)).toBeVisible({ timeout: 20_000 });
    const reply = await leaver.request('leave_game_session', { gameId: t.gameId });
    expect(reply?.ok, `나가기 거절: ${reply?.code}`).toBe(true);
    // 나간 산 사람은 판에서 빠져 카드가 산 사람 표시가 아니게 됨
    await expect(night.cardStatus(page, leaver.nickname)).toHaveAttribute('data-ingame-player-status', /^(dead|disconnected)$/);
    // 판이 안 깨지고 그대로 첫 낮 (손잡이 안 씀)
    await expect(dayNotice(page)).toBeVisible({ timeout: 20_000 });
    const s = await t.state();
    expect(s.phase).toBe('DAY');
    expect(s.dayIndex).toBe(1);
});

test('A02-E-097 5명 J1C4(사람 시민) 역할 확인 중, 광대 봇 나감 → 결과 화면 시민 승 @game', async ({ user, table }) => {
    const page = user.page;
    const roles = ['JOKER', 'CITIZEN', 'CITIZEN', 'CITIZEN'];
    const t = await openTable(table, user, 5, roles);
    const joker = t.bots[0];
    await expect(revealDialog(page)).toBeVisible({ timeout: 20_000 });
    const reply = await joker.request('leave_game_session', { gameId: t.gameId });
    expect(reply?.ok, `나가기 거절: ${reply?.code}`).toBe(true);
    await waitResult(page);
    await expectReadable(page.getByText('시민 진영 승리', { exact: true }));
    // 서버 승패도 시민 (남은 봇이 끝난 판을 물어봄)
    const win = await night.publicWinResult(t, 1);
    expect(win?.winner).toBe('CITIZEN');
});
