'use strict';

// 역할 확인 단계 조작 브라우저 시험 (PC) — 채팅 막힘·이모티콘 안 됨(낮에만)·투표/준비 단추 없음·확인 뒤 판 안 가려짐·첫 낮 뒤 창 다시 안 뜸·역할 확인 중 나감
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

// 꺼진 채팅 입력칸에 보이는 까닭 글 (화면 utils/inGameChatChannel.js)
const CHAT_LOCKED_HINT = '역할 확인이 끝나면 채팅할 수 있습니다';

// 말풍선 칸 (카드 위, 이모티콘이 판에 나가면 그려짐)
const bubbleOn = (page, nickname) => night.cardButton(page, nickname).locator('[data-ingame-emoji-bubble]');
const emojiPalette = (page) => page.getByRole('group', { name: '이모티콘 팔레트' });
// 입장 준비 덮개: 역할 확인(ROLE_REVEAL) 동안 판 전체를 어둡게 덮고 누르기를 받음, 역할 창은 그 위 (합친 뒤 동작 — frontend entryPreparing/InGameEntryPreparingOverlay.jsx)
const ENTRY_TEXT = '가면무도회에 입장하는 중입니다.';
const entryCover = (page) => page.locator('[data-ingame-entry-preparing]');

// A02-E-089~090: 역할 확인 중 채팅 막힘 — 입력칸·보내기가 꺼지고 입력칸 자리에 까닭 글 (결정 "확인 10초: 채팅 못 씀")
for (const [no, n] of [[89, 5], [90, 8]]) {
    const smoke = no === 89 ? ' @smoke' : '';
    test(`A02-E-0${no} ${n}명 역할 확인 중 → 채팅 입력칸·보내기 꺼짐, 까닭 글 보임 @game${smoke}`, async ({ user, table }) => {
        const page = user.page;
        const t = await openTable(table, user, n);
        await closeReveal(page);
        await expect(page.getByRole('textbox', { name: '채팅 입력' })).toBeDisabled();
        await expect(page.getByRole('button', { name: '채팅 보내기' })).toBeDisabled();
        await expect(page.getByText(CHAT_LOCKED_HINT, { exact: true }).first()).toBeVisible();
        await expectStillRoleReveal(t);
    });
}

// 이모티콘은 낮에만 — 역할 확인 10초도 안 됨 (결정 2026-11-16 오전 "이모티콘" + 낮 "반장이 정하고 알린 것" 1번)
test('A02-E-091 6명 역할 확인 중, 내 카드 오른쪽 누름 → 이모티콘 팔레트 안 열림·말풍선 없음 (낮이 되면 열림) @game', async ({ user, table }) => {
    const page = user.page;
    const t = await openTable(table, user, 6);
    const mine = night.cardButton(page, user.account.nickname);
    await closeReveal(page);
    // 판 화면이 다 그려진 뒤에 봄 (안 그려져서 "없음"이 맞는 것 막기)
    await expect(page.locator('[data-ingame-player-nickname]')).toHaveCount(6);
    // 내 카드 자리 오른쪽 누름 → 입장 준비 덮개가 받아 팔레트가 안 열림, 말풍선도 안 그려짐 (덮개가 카드를 가려 force로 그 자리를 누름)
    await expect(entryCover(page)).toBeVisible();
    await mine.click({ button: 'right', force: true });
    await expect(emojiPalette(page)).toHaveCount(0);
    await expect(bubbleOn(page, user.account.nickname)).toHaveCount(0);
    expect(eventAt(t.bots[0], 'emoji_shown'), '판 사람에게 이모티콘이 나감').toBeNull();
    await expectStillRoleReveal(t);
    // 견줌: 첫 낮(손잡이로 감)엔 같은 누름으로 팔레트가 열림 (누르는 법이 틀려서 안 열린 것과 가르기)
    await t.advanceUntil('DAY');
    await day.closeNotice(page, '낮이 되었습니다');
    await mine.click({ button: 'right' });
    await expect(emojiPalette(page)).toBeVisible();
});

test('A02-E-092 7명 역할 확인 중, 봇이 이모티콘 → 서버가 거절(INVALID_PHASE), 내 화면 그 봇 카드에 말풍선 없음 @game', async ({ user, table }) => {
    const page = user.page;
    const t = await openTable(table, user, 7);
    await closeReveal(page);
    await expect(page.locator('[data-ingame-player-nickname]')).toHaveCount(7);
    const sender = t.bots[1];
    const reply = await sender.request('send_emoji', { gameId: t.gameId, itemId: HELLO.id });
    expect(reply?.ok, '역할 확인 중 이모티콘이 받아들여짐').toBe(false);
    expect(reply?.code).toBe('INVALID_PHASE');
    await expectStillRoleReveal(t);
    await expect(bubbleOn(page, sender.nickname)).toHaveCount(0);
    expect(eventAt(t.bots[0], 'emoji_shown'), '판 사람에게 이모티콘이 나감').toBeNull();
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
    // 남의 카드 자리를 눌러도 투표 항목 없음 (입장 준비 덮개가 카드를 가려 force로 그 자리를 누름 — 누름은 덮개가 받음)
    await expect(entryCover(page)).toBeVisible();
    await night.cardButton(page, t.bots[0].nickname).click({ force: true });
    await expect(page.getByRole('menuitem', { name: '투표하기' })).toHaveCount(0);
    await expectStillRoleReveal(t);
});

// 합친 뒤 동작: 역할 확인 동안엔 입장 준비 덮개가 판을 덮음 → 확인 뒤엔 덮개 글이 읽히고, 첫 낮이 되면 덮개가 걷혀 판 카드가 안 가려짐
test('A02-E-094 6명, 확인 → 역할 창 사라지고 "가면무도회에 입장하는 중입니다." 덮개가 읽힘, 첫 낮엔 덮개 없이 판 카드가 안 가려지고 읽힘 @game', async ({ user, table }) => {
    const page = user.page;
    const t = await openTable(table, user, 6);
    await closeReveal(page);
    await expectReadable(entryCover(page).getByText(ENTRY_TEXT, { exact: true }));
    await expectStillRoleReveal(t);
    await t.advanceUntil('DAY');
    await day.closeNotice(page, '낮이 되었습니다');
    await expect(entryCover(page)).toHaveCount(0);
    const nicknames = [user.account.nickname, ...t.bots.map((b) => b.nickname)];
    for (const nick of nicknames) await expectReadable(night.cardStatus(page, nick).getByText(nick, { exact: true }));
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
