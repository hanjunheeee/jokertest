'use strict';

// 낮 투표 고르기 브라우저 시험 (PC) — 표 대상 목록·죽은 사람·내가 죽음·기권·토론 안내·새로고침·누가 누굴 찍었나 안 보임·판정 뒤·동료 광대·키보드·현황 창
// 목록 A03-낮투표.md 번호 A03-E-128~158 중 PC 몫(128~138 짝수·140~154 짝수·156·157·158)
const { test, expect, ui } = require('../../helpers/fixtures');
const { customRoleSettings } = require('../../helpers/game');
const { expectReadable } = require('../../helpers/visible');
const L = require('./a-day/_lib');

const U = (x) => x.account.uuid;
const nickOf = (t, uuid) => [...t.bots, ...t.humans].find((x) => U(x) === uuid).account.nickname;

// 토론 중 카드 메뉴 "투표하기"에 붙는 까닭 글 (화면 constants/actions/ingameActionPanel.js)
const DISCUSSION_NOTICE = '토론 중입니다. 투표는 아직 열리지 않았습니다.';
// 죽은 사람 화면에서 투표 중 "투표하기"가 꺼진 까닭 글 (화면 constants/board/playerCardMenu.js)
const DEAD_NOTICE = '사망한 플레이어는 행동할 수 없습니다';

// 직업 전부 정함: 사람 role, 광대 jokers명(사람이 광대면 사람 포함)은 봇 앞자리부터, 나머지 시민
function rolesFor({ role = 'CITIZEN', jokers = 1 } = {}) {
    const botJokers = jokers - (role === 'JOKER' ? 1 : 0);
    return ({ humans, bots }) => {
        const out = { [U(humans[0])]: role };
        bots.forEach((b, i) => { out[U(b)] = i < botJokers ? 'JOKER' : 'CITIZEN'; });
        return out;
    };
}

// n명 판 (사람 1 + 봇 n-1, 직접 구성) 차리고 직업이 정한 대로 됐는지 한 번 확인 (서버 예약이 가끔 못 맞음)
async function openTable(table, user, n, { role = 'CITIZEN', jokers = 1, settings = {} } = {}) {
    const roles = rolesFor({ role, jokers });
    const t = await table.setup({ humans: [user], bots: n - 1, settings: { ...customRoleSettings({ JOKER: jokers }), ...settings }, roles });
    const want = roles({ humans: t.humans, bots: t.bots });
    const s = await t.state();
    expect(s.players).toHaveLength(n);
    for (const p of s.players) expect(p.role, `${p.nickname} 직업`).toBe(want[p.uuid]);
    return t;
}

// 봇이 받은 알림 한 줄 기다림 → { event, payload, at(받은 시각) }
async function eventRow(bot, event, { since = 0, match = () => true, timeout = 20000 } = {}) {
    let row = null;
    await expect.poll(() => {
        row = bot.events.find((r) => r.event === event && r.at >= since && match(r.payload)) ?? null;
        return row !== null;
    }, { timeout, message: `${event} 알림 기다림` }).toBe(true);
    return row;
}

// 단계 전환 안내 창 중 text가 든 창까지 (그 앞 다른 안내·밤 차례 안내·알림 창은 닫음), 그 창도 닫음
async function reachNotice(page, text, { timeout = 40000 } = {}) {
    const notice = page.getByRole('dialog', { name: '단계 전환 안내', exact: true });
    await expect.poll(async () => {
        await ui.closeOverlays(page, { names: ['밤 역할 안내', '알림'], keepWatching: false, rounds: 1 });
        if (!(await notice.isVisible().catch(() => false))) return false;
        const shown = await notice.innerText().catch(() => '');
        await notice.getByRole('button', { name: '확인' }).click({ timeout: 2000 }).catch(() => {});
        return shown.includes(text);
    }, { timeout, intervals: [300], message: `"${text}" 안내 창` }).toBe(true);
}

// 1일 낮 표·재판으로 victim 처형 → 밤 → 2일 낮 토론까지, 사람 화면 연출도 닫음 (앞 단계라 손잡이로 넘김)
async function executeThenDay2(t, page, victimUuid, { humanDies }) {
    await L.toVote(t);
    const voters = t.bots.filter((b) => U(b) !== victimUuid);
    await L.botsVote(t, voters.map((b) => [b, victimUuid]));
    const tri = await L.resolveVote(t);
    expect(tri.phase).toBe('TRIBUNAL');
    expect(tri.tribunal?.defendantUuid).toBe(victimUuid);
    await L.botsTribunal(t, voters.map((b) => [b, 'GUILTY']));
    await L.resolveTribunal(t);
    await L.waitState(t, (g) => g.players.find((p) => p.uuid === victimUuid)?.alive === false);
    if (humanDies) await L.keepWatching(page);
    else await reachNotice(page, '밤이 되었습니다');
    await t.advanceUntil((s) => s.phase === 'DAY' && s.dayIndex === 2 && s.dayPhase === 'DAY_DISCUSSION');
    // 산 사람은 2일 "낮이 되었습니다" 닫음, 죽은 사람 창은 저절로 닫힘
    // 그 앞 "지난밤 아무 일도 일어나지 않았습니다" 창(이름 같음, 죽은 사람도 봄)은 확인을 눌러야 닫혀서 넘김
    if (humanDies) {
        await expect(async () => {
            await ui.closeQuietDawn(page);
            await expect(page.getByRole('dialog', { name: '단계 전환 안내', exact: true })).toHaveCount(0, { timeout: 2000 });
        }).toPass({ timeout: 20000 });
    } else await reachNotice(page, '낮이 되었습니다');
}

// 2일 토론 → 투표 (손잡이), 사람 화면에 기권 단추까지
async function toVoteDay2(t) {
    await t.advance();
    await L.waitState(t, (g) => g.phase === 'DAY' && g.dayIndex === 2 && g.dayPhase === 'DAY_VOTE');
    for (const h of t.humans) await expect(h.page.getByRole('button', { name: '기권' })).toBeVisible();
}

// 카드 눌러 메뉴 항목 읽고 Esc로 닫음 → [{ name, enabled, title }]
async function readCardMenu(page, nickname) {
    await L.card(page, nickname).click();
    const menu = page.getByRole('menu', { name: '플레이어 행동' });
    await expect(menu).toBeVisible();
    const items = await menu.locator('[role="menuitem"]').evaluateAll((els) => els.map((el) => ({
        name: el.getAttribute('aria-label'),
        enabled: !el.disabled,
        title: el.getAttribute('title'),
    })));
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    return items;
}
const canVote = (items) => items.some((it) => it.name === '투표하기' && it.enabled);

// 그 사람 카드 메뉴에 "투표취소"가 있음 = 내 표가 그 사람에게 가 있음 (서버가 받은 뒤 보이는 표시)
async function expectVotedFor(page, nickname) {
    await expect(async () => {
        // 새로고침 뒤 역할 창 같은 연출이 판을 덮으면 먼저 닫음
        await ui.closeOverlays(page);
        const items = await readCardMenu(page, nickname);
        expect(items.map((it) => it.name)).toContain('투표취소');
    }).toPass({ timeout: 10000 });
}

// 나 빼고 다른 사람 카드 중 누를 수 있는 "투표하기"가 있는 닉네임 목록
async function votableNicknames(t, page, me) {
    const s = await t.state();
    const out = [];
    for (const p of s.players.filter((x) => x.uuid !== me)) {
        if (canVote(await readCardMenu(page, p.nickname))) out.push(p.nickname);
    }
    return out.sort();
}

// A03-E-128~138 짝수 PC 5~10명 판 → 고를 수 있는 사람 = 나 빼고 산 사람
[5, 6, 7, 8, 9, 10].forEach((n, i) => {
    test(`A03-E-${128 + i * 2} PC ${n}명 판 표 대상 목록 → 고를 수 있는 사람은 나 빼고 산 사람 ${n - 1}명 @game`, async ({ user, table }) => {
        const t = await openTable(table, user, n);
        const page = user.page;
        await L.toDay(t);
        await L.toVote(t);
        const s = await t.state();
        const want = s.players.filter((p) => p.alive && p.uuid !== U(user)).map((p) => p.nickname).sort();
        expect(want).toHaveLength(n - 1);
        expect(await votableNicknames(t, page, U(user))).toEqual(want);
        // 내 카드는 메뉴가 안 열림
        const mine = L.selfCard(page, user.account.nickname);
        await mine.click();
        await expect(mine).toHaveAttribute('aria-expanded', 'false');
    });
});

test('A03-E-140 PC 7명 판 2일(1명 죽음) 죽은 사람 카드엔 투표 없음 @game', async ({ user, table }) => {
    test.setTimeout(180_000);
    const t = await openTable(table, user, 7);
    const page = user.page;
    await L.toDay(t);
    const dead = U(t.bots[1]);
    await executeThenDay2(t, page, dead, { humanDies: false });
    await toVoteDay2(t);
    const deadItems = await readCardMenu(page, nickOf(t, dead));
    expect(canVote(deadItems), '죽은 사람 카드에 누를 수 있는 투표하기').toBe(false);
    const s = await t.state();
    const want = s.players.filter((p) => p.alive && p.uuid !== U(user)).map((p) => p.nickname).sort();
    expect(want).toHaveLength(5);
    expect(await votableNicknames(t, page, U(user))).toEqual(want);
});

test('A03-E-142 PC 7명 판 2일 내가 죽으면 기권 단추 없음, 누를 수 있는 투표하기 없음 @game', async ({ user, table }) => {
    test.setTimeout(180_000);
    const t = await openTable(table, user, 7);
    const page = user.page;
    await L.toDay(t);
    await executeThenDay2(t, page, U(user), { humanDies: true });
    await t.advance();
    await L.waitState(t, (g) => g.dayIndex === 2 && g.dayPhase === 'DAY_VOTE');
    // 화면도 투표 단계로 바뀐 뒤 봄: 죽은 사람은 기권 단추가 없어, 산 봇 카드의 꺼진 "투표하기" 까닭 글로 봄 (토론이면 토론 안내 글)
    const menu = page.getByRole('menu', { name: '플레이어 행동' });
    await expect(async () => {
        if (!(await menu.isVisible())) await L.card(page, nickOf(t, U(t.bots[1]))).click({ timeout: 1500 });
        await expect(menu.getByRole('menuitem', { name: '투표하기' })).toHaveAttribute('title', DEAD_NOTICE, { timeout: 1000 });
    }).toPass({ timeout: 15000 });
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    // 기권 단추: 죽은 사람에겐 안 그림
    await expect(page.locator('[data-ingame-phase-action="dayVoteAbstain"]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '기권' })).toHaveCount(0);
    // 산 사람 카드 어디에도 누를 수 있는 투표하기 없음
    expect(await votableNicknames(t, page, U(user))).toEqual([]);
});

test('A03-E-144 PC 6명 판 "기권" 누름 → 낸 표시(기권 단추 꺼짐) @game', async ({ user, table }) => {
    const t = await openTable(table, user, 6);
    const page = user.page;
    await L.toDay(t);
    await L.toVote(t);
    const abstain = page.getByRole('button', { name: '기권' });
    await expect(abstain).toBeEnabled();
    await expectReadable(abstain);
    await abstain.click();
    await expect(abstain).toBeDisabled();
    // 기권은 대상이 없어 어느 카드에도 투표취소 없음
    const s = await t.state();
    for (const p of s.players.filter((x) => x.uuid !== U(user))) {
        const items = await readCardMenu(page, p.nickname);
        expect(items.map((it) => it.name)).not.toContain('투표취소');
    }
});

test('A03-E-146 PC 5명 판 토론 중 안내 "토론 중입니다. 투표는 아직 열리지 않았습니다.", 표 못 냄 @game', async ({ user, table }) => {
    const t = await openTable(table, user, 5);
    const page = user.page;
    await L.toDay(t);
    const other = nickOf(t, U(t.bots[1]));
    await L.card(page, other).click();
    const menu = page.getByRole('menu', { name: '플레이어 행동' });
    const item = menu.getByRole('menuitem', { name: '투표하기' });
    await expect(item).toBeDisabled();
    await expect(item).toHaveAttribute('title', DISCUSSION_NOTICE);
    await expect(item).toContainText(DISCUSSION_NOTICE);
    // 꺼진 "투표하기" 아래 보이는 까닭 글 한 줄 (마우스를 안 올려도 읽힘 — 결정 2026-11-16 낮 넷째 3번)
    const reason = menu.locator('[data-ingame-card-menu-reason]').filter({ hasText: DISCUSSION_NOTICE });
    await expect(reason).toHaveText(DISCUSSION_NOTICE);
    await expectReadable(reason);
    await page.keyboard.press('Escape');
    // 토론 중엔 기권 단추도 없음
    await expect(page.locator('[data-ingame-phase-action="dayVoteAbstain"]')).toHaveCount(0);
    expect((await t.state()).dayPhase).toBe('DAY_DISCUSSION');
});

test('A03-E-148 PC 8명 판 표 낸 뒤 새로고침 → 낸 표시 남음, 다시 바꿀 수 있음 [지금 동작] @game', async ({ user, table }) => {
    const t = await openTable(table, user, 8);
    const page = user.page;
    await L.toDay(t);
    await L.toVote(t);
    const X = nickOf(t, U(t.bots[1]));
    const Y = nickOf(t, U(t.bots[2]));
    await L.voteUi(page, X);
    await expectVotedFor(page, X);

    await page.reload();
    await expect(L.card(page, X)).toBeVisible({ timeout: 20000 });
    await ui.closeOverlays(page);
    // 낸 표시: X 카드에 투표취소, 기권 단추는 켜짐 (찍은 뒤 기권으로 바꾸기 됨, 사용자 결정 2026-11-18)
    await expect(page.getByRole('button', { name: '기권' })).toBeEnabled();
    await expectVotedFor(page, X);
    // 다시 바꿀 수 있음: Y로 바꾸면 Y 카드에 투표취소
    await L.cardAction(page, Y, '투표하기');
    await expectVotedFor(page, Y);
});

test('A03-E-150 PC 7명 판 봇이 서로 찍어도 사람 화면엔 수·결과만, 투표자 이름 없음 @game', async ({ user, table }) => {
    const t = await openTable(table, user, 7);
    const page = user.page;
    await L.toDay(t);
    const since = Date.now();
    await L.toVote(t);
    // 봇 6이 차례로 다음 봇을 찍음 (모두 1표씩)
    await L.botsVote(t, t.bots.map((b, i) => [b, U(t.bots[(i + 1) % t.bots.length])]));
    const names = [...t.bots, user].map((x) => x.account.nickname);
    const dialog = page.getByRole('dialog', { name: '투표 현황' });

    // 판정 전: 현황 창은 "집계 전"과 낸 사람 수("6 / 7명 투표함", 2026-11-18)만, 이름 없음
    await page.getByRole('button', { name: '투표 현황 열기' }).click();
    await expect(dialog).toContainText('집계 전');
    await expect(dialog.getByTestId('vote-status-progress')).toHaveText('6 / 7명 투표함');
    const before = await dialog.innerText();
    for (const name of names) expect(before, '판정 전 현황 창에 이름').not.toContain(name);
    await dialog.getByRole('button', { name: '투표 현황 닫기' }).click();
    await expect(dialog).toBeHidden();

    // 사람이 기권해 다 참 → 5초 뒤 판정 (손잡이 안 씀)
    const abstain = page.getByRole('button', { name: '기권' });
    await abstain.click();
    await expect(abstain).toBeDisabled();
    const resolved = await eventRow(t.bots[0], 'day_vote_resolved', { since, match: (p) => p.dayIndex === 1 });
    expect(resolved.payload.tribunalTargetUuid).toBeNull();
    await reachNotice(page, '밤이 되었습니다');

    // 판정 뒤: 수·결과만, 이름 없음 (재판 대상 "없음")
    await page.getByRole('button', { name: '투표 현황 열기' }).click();
    await expect(dialog.getByTestId('vote-status-tribunal-target')).toHaveText('없음');
    const after = await dialog.innerText();
    for (const name of names) expect(after, '판정 뒤 현황 창에 이름').not.toContain(name);
    // 채팅 칸에도 누가 누굴 찍었다는 줄 없음
    const log = await L.chatLog(page).innerText();
    for (const name of t.bots.map((b) => b.account.nickname)) expect(log, '채팅 칸에 봇 이름').not.toContain(name);
});

test('A03-E-152 PC 6명 판 재판으로 넘어간 뒤 → 낮 표 단추 없음, 결과 그대로 @game', async ({ user, table }) => {
    const t = await openTable(table, user, 6);
    const page = user.page;
    await L.toDay(t);
    const since = Date.now();
    await L.toVote(t);
    const X = U(t.bots[1]);
    await L.botsVote(t, t.bots.filter((b) => U(b) !== X).map((b) => [b, X]));
    // 사람은 X 카드 메뉴를 연 채 판정을 맞음 (늦게 누르려는 손)
    await L.card(page, nickOf(t, X)).click();
    await expect(page.getByRole('menu', { name: '플레이어 행동' })).toBeVisible();
    const tri = await L.resolveVote(t);
    expect(tri.phase).toBe('TRIBUNAL');
    expect(tri.tribunal?.defendantUuid).toBe(X);

    await expect(page.getByRole('dialog', { name: '재판' })).toBeVisible({ timeout: 15000 });
    // 낮 표 단추·메뉴 항목·기권이 화면 어디에도 없음 (잠긴 판 화면 안까지)
    await expect(page.locator('[role="menuitem"][aria-label="투표하기"]')).toHaveCount(0);
    await expect(page.locator('[role="menuitem"][aria-label="투표취소"]')).toHaveCount(0);
    await expect(page.locator('[data-ingame-phase-action="dayVoteAbstain"]')).toHaveCount(0);
    // 결과 그대로: 판정 알림 한 번, 피고 X
    const resolved = await eventRow(t.bots[0], 'day_vote_resolved', { since, match: (p) => p.dayIndex === 1 });
    expect(resolved.payload.tribunalTargetUuid).toBe(X);
    expect(t.bots[0].events.filter((r) => r.event === 'day_vote_resolved' && r.at >= since)).toHaveLength(1);
    expect((await t.state()).tribunal?.defendantUuid).toBe(X);
    await expect(page.getByRole('dialog', { name: '재판' })).toContainText(nickOf(t, X));
});

test('A03-E-154 PC 7명 판 광대 2 — 사람 광대가 동료 광대에게 투표 → 받아들여짐 @game', async ({ user, table }) => {
    const t = await openTable(table, user, 7, { role: 'JOKER', jokers: 2 });
    const page = user.page;
    await L.toDay(t);
    await L.toVote(t);
    const ally = nickOf(t, U(t.bots[0]));
    await L.cardAction(page, ally, '투표하기');
    await expectVotedFor(page, ally);
});

// 키보드만으로 초점 옮기기: Tab을 눌러 조건 맞는 요소에 닿을 때까지 (닿으면 참)
async function tabTo(page, isTarget, { max = 80 } = {}) {
    for (let i = 0; i < max; i += 1) {
        await page.keyboard.press('Tab');
        if (await page.evaluate(isTarget)) return true;
    }
    return false;
}

test('A03-E-156 PC 6명 판 키보드 ① Tab·Enter로 사람 고름 → 서버가 받음 @game', async ({ user, table }) => {
    const t = await openTable(table, user, 6);
    const page = user.page;
    await L.toDay(t);
    await L.toVote(t);
    const X = nickOf(t, U(t.bots[1]));
    // 카드(누를 수 있는 칸)까지 Tab → Enter로 메뉴 → 메뉴 안 "투표하기"까지 Tab → Enter
    const onCard = await tabTo(page, `(() => { const el = document.activeElement; return !!el && el.getAttribute('aria-haspopup') === 'menu' && (el.textContent || '').includes(${JSON.stringify(X)}); })()`);
    expect(onCard, 'Tab으로 카드에 닿음').toBe(true);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('menu', { name: '플레이어 행동' })).toBeVisible();
    const onItem = await tabTo(page, "document.activeElement?.getAttribute('aria-label') === '투표하기'", { max: 15 });
    expect(onItem, 'Tab으로 투표하기에 닿음').toBe(true);
    await page.keyboard.press('Enter');
    await expectVotedFor(page, X);
});

test('A03-E-157 PC 6명 판 키보드 ② Tab·Enter로 기권 → 서버가 받음 @game', async ({ user, table }) => {
    const t = await openTable(table, user, 6);
    const page = user.page;
    await L.toDay(t);
    await L.toVote(t);
    const onAbstain = await tabTo(page, "document.activeElement?.getAttribute('aria-label') === '기권'");
    expect(onAbstain, 'Tab으로 기권에 닿음').toBe(true);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: '기권' })).toBeDisabled();
});

test('A03-E-158 PC 5명 판 현황 창 열기 → 보임, 닫기 → 안 보임 @game @smoke', async ({ user, table }) => {
    const t = await openTable(table, user, 5);
    const page = user.page;
    await L.toDay(t);
    await L.toVote(t);
    const dialog = page.getByRole('dialog', { name: '투표 현황' });
    await expect(dialog).toHaveCount(0);
    await page.getByRole('button', { name: '투표 현황 열기' }).click();
    await expect(dialog).toBeVisible();
    await expectReadable(dialog.getByTestId('vote-status-unresolved'));
    await dialog.getByRole('button', { name: '투표 현황 닫기' }).click();
    await expect(dialog).toBeHidden();
});
