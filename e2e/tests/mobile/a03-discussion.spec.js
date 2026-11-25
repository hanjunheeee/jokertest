'use strict';

// 모바일 낮 토론 시험: "낮이 되었습니다" 창·전원 준비면 바로 투표·일부만 준비·준비 단추 글·죽은 사람·나간 사람·토론/투표 시간 설정·채팅(150자·0.5초·투표 중)
// 목록 A03-낮투표.md A03-E-161·163·167·168·170·172·174·176·178~186 짝수·188·190·192·194·196·198 (모바일 몫), 돌리지 않고 모임만: npx playwright test --list tests/mobile/a03-discussion.spec.js
const { test, expect } = require('../../helpers/fixtures');
const ui = require('../../helpers/ui');
const { sleep } = require('../../helpers/wait');
const { talk, startTalkGame, toDay, toVote, clearOverlays, getExecuted, say, CHAT_GAP_MS, expectDayLine } = require('./_talk');

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

const uuidOf = (who) => who.account.uuid;

const abstainButton = (page) => page.getByRole('button', { name: '기권' });

// 단계 줄 남은 초 ("제 1일 · 5초 뒤 마감 0:04" → 4, 시계 없으면 null)
async function phaseClock(page) {
    const text = await talk.phaseLine(page).innerText({ timeout: 2_000 });
    const m = /(\d+):(\d{2})/.exec(text);
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

// 봇이 받은 사건 하나 + 받은 시각 (since 뒤 것만)
async function eventAt(bot, event, { since = 0, match = () => true, timeoutMs = 40_000 } = {}) {
    const payload = await bot.waitForEvent(event, { since, match, timeoutMs });
    const row = bot.events.find((r) => r.payload === payload);
    return { payload, at: row?.at ?? Date.now() };
}

const readyButton = (page) => talk.phaseAction(page, 'dayReady');
const noticeOf = (page) => page.getByRole('dialog', { name: '단계 전환 안내' });

// 판 차리고 역할 공개까지 닫음 (낮은 아직)
async function openGame(table, user, n, settings) {
    const roles = rolePlan(n);
    const t = await startTalkGame(table, user, { bots: n - 1, roles, settings });
    await expectRoles(t, roles);
    return t;
}

// "낮이 되었습니다" 창이 뜰 때까지 (앞에 남은 "밤이 되었습니다"·밤 안내·"지난밤 아무 일도 일어나지 않았습니다" 창은 닫으며)
async function waitDayNotice(page) {
    await expect(async () => {
        const notice = noticeOf(page);
        if (await notice.isVisible() && (await notice.innerText()).includes('밤이 되었습니다')) {
            await notice.getByRole('button', { name: '확인' }).click();
        }
        await ui.closeOverlays(page, { rounds: 1, names: ['밤 역할 안내', '알림'], keepWatching: false, quietDawn: true });
        await expect(notice).toContainText('낮이 되었습니다', { timeout: 1_000 });
    }).toPass({ timeout: 30_000 });
}

// "낮이 되었습니다" 창 확인 눌러 닫기
async function closeDayNotice(page) {
    await waitDayNotice(page);
    await noticeOf(page).getByRole('button', { name: '확인' }).click();
    await expect(noticeOf(page)).toBeHidden();
}

// "낮이 되었습니다" 창이 떠 있는 동안: 준비 꺼짐·입력 줄 막힘·시계는 줄어듦 → 확인 누르면 준비·채팅 됨
async function expectNoticeBlocksThenOpens(page) {
    const notice = noticeOf(page);
    await expect(readyButton(page)).toBeDisabled();
    await expect(page.locator('[data-chat-composer]')).toHaveAttribute('inert');
    const first = await phaseClock(page);
    expect(first).not.toBeNull();
    await expect.poll(() => phaseClock(page), { timeout: 5_000 }).toBeLessThan(first);
    await expect(notice).toBeVisible();
    await notice.getByRole('button', { name: '확인' }).click();
    await expect(notice).toBeHidden();
    await expect(readyButton(page)).toBeEnabled();
    await say(page, `낮채팅${Date.now() % 100000}`);
}

// 지금 단계 시계를 처음 읽은 값 (label이 맞고 시계가 있을 때까지)
async function firstClock(page, labelPart) {
    let sec = null;
    await expect.poll(async () => {
        const text = await talk.phaseLine(page).innerText({ timeout: 1_000 }).catch(() => '');
        const m = /(\d+):(\d{2})/.exec(text);
        sec = text.includes(labelPart) && m ? Number(m[1]) * 60 + Number(m[2]) : null;
        return sec;
    }, { timeout: 10_000, intervals: [100] }).not.toBeNull();
    return sec;
}

// 봇 여럿 투표 준비 (서버 답 ok)
async function botsReady(t, bots) {
    for (const bot of bots) {
        const reply = await bot.request('ready_for_day_vote', { gameId: t.gameId });
        expect(reply?.ok, `봇 준비 거절: ${reply?.code}`).toBe(true);
    }
}

// ── 시험 ──

test('A03-E-161 모바일 6명 판 1일 "낮이 되었습니다" 창 → 안 누르면 준비·채팅 못 함, 시간 줄은 줄어듦, 누르면 됨 @game @safari @smoke', async ({ user, table }) => {
    const t = await openGame(table, user, 6);
    await t.advanceUntil('DAY');
    await waitDayNotice(user.page);
    await expectNoticeBlocksThenOpens(user.page);
});

test('A03-E-163 모바일 8명 판 2일에도 "낮이 되었습니다" 창 → 같음 @game', async ({ user, table }) => {
    test.setTimeout(180_000);
    const t = await openGame(table, user, 8);
    await toDay(t, user.page);
    // 1일 투표는 아무도 안 내 밤 → 밤 차례는 손잡이로 넘김
    await t.advanceUntil((s) => s.phase === 'DAY' && s.dayIndex === 2);
    await waitDayNotice(user.page);
    await expectDayLine(user.page, t, 2);
    await expectNoticeBlocksThenOpens(user.page);
});

// E-167·168: 토론 150초, 사람이 마지막 준비 → 바로 투표 (모바일 6·9명)
[[167, 6], [168, 9]].forEach(([no, n]) => {
    test(`A03-E-${no} 모바일 ${n}명 판 토론 150초 · 사람이 마지막 준비 → 바로 투표 단계 @game`, async ({ user, table }) => {
        const t = await openGame(table, user, n, { dayDiscussionTime: 150 });
        await toDay(t, user.page);
        await botsReady(t, t.bots);
        const at = Date.now();
        await readyButton(user.page).click();
        await expect(abstainButton(user.page)).toBeVisible({ timeout: 5_000 });
        expect((await t.state()).dayPhase).toBe('DAY_VOTE');
        expect(Date.now() - at).toBeLessThan(10_000);
    });
});

test('A03-E-170 모바일 7명 판 토론 30초 · 봇 1 준비 안 함 → 30초 끝에 투표 @game @realtime', async ({ user, table }) => {
    const t = await openGame(table, user, 7, { dayDiscussionTime: 30 });
    await t.advanceUntil('DAY');
    const deadline = (await t.bots[0].snapshot(t.gameId))?.dayPhaseDeadline;
    expect(deadline).toBeGreaterThan(Date.now());
    await closeDayNotice(user.page);
    await botsReady(t, t.bots.slice(0, -1));
    await readyButton(user.page).click();
    await expect(readyButton(user.page)).toHaveText('준비 완료');
    const changed = await eventAt(t.bots[0], 'day_phase_changed', {
        match: (p) => p.dayPhase === 'DAY_VOTE' && p.dayIndex === 1, timeoutMs: deadline - Date.now() + 20_000,
    });
    expect(Math.abs(changed.at - deadline)).toBeLessThanOrEqual(1_500);
    await expect(abstainButton(user.page)).toBeVisible();
});

test('A03-E-172 모바일 5명 판 준비 단추 글 "투표 시작 준비" → 누르면 "준비 완료" @game', async ({ user, table }) => {
    const t = await openGame(table, user, 5);
    await toDay(t, user.page);
    await expect(readyButton(user.page)).toHaveText('투표 시작 준비');
    await readyButton(user.page).click();
    await expect(readyButton(user.page)).toHaveText('준비 완료');
});

test('A03-E-174 모바일 7명 판 2일 죽은 나 → 준비 단추 꺼짐 @game', async ({ user, table }) => {
    test.setTimeout(240_000);
    const t = await openGame(table, user, 7);
    await getExecuted(t, uuidOf(user), { pages: [user.page] });
    await t.stopBots();
    await t.advanceUntil((s) => s.phase === 'DAY' && s.dayIndex === 2 && s.dayPhase === 'DAY_DISCUSSION');
    await clearOverlays(user.page);
    await expectDayLine(user.page, t, 2);
    // 모바일(상대 화면)은 죽은 사람에게도 준비 단추를 그리되 꺼 둠 (frontend-mobile ingame/hooks/actions/buildRowActions.js)
    await expect(readyButton(user.page)).toBeDisabled();
});

test('A03-E-176 모바일 6명 판 준비 안 한 봇이 나감 → 나머지 다 준비 → 바로 투표 @game', async ({ user, table }) => {
    const t = await openGame(table, user, 6, { dayDiscussionTime: 150 });
    await toDay(t, user.page);
    // 봇 3(의사)이 준비 안 하고 나감 — 광대(봇 4)가 나가면 판이 끝나 버려서
    const leaver = t.bots[3];
    await botsReady(t, t.bots.filter((b) => b !== leaver));
    await readyButton(user.page).click();
    await expect(readyButton(user.page)).toHaveText('준비 완료');
    const left = await leaver.request('leave_game_session', { gameId: t.gameId });
    expect(left?.ok, `나가기 거절: ${left?.code}`).toBe(true);
    await expect(abstainButton(user.page)).toBeVisible({ timeout: 5_000 });
    expect((await t.state()).dayPhase).toBe('DAY_VOTE');
});

// E-178~186 짝수: 토론 30·60·90·120·150초 (6·7·8·10·5명 판) → 첫 낮 처음 남은 시간이 그 값(±2초)
[[178, 30, 6], [180, 60, 7], [182, 90, 8], [184, 120, 10], [186, 150, 5]].forEach(([no, sec, n]) => {
    test(`A03-E-${no} 모바일 ${n}명 판 토론 ${sec}초 → 첫 낮 처음 남은 시간 ${sec}초(±2) @game`, async ({ user, table }) => {
        const t = await openGame(table, user, n, { dayDiscussionTime: sec });
        await t.advanceUntil('DAY');
        const shown = await firstClock(user.page, '낮');
        expect(Math.abs(shown - sec)).toBeLessThanOrEqual(2);
    });
});

// E-188·190·192: 투표 30·60·90초 (6·7·8명 판) → 투표 단계 처음 남은 시간이 그 값(±2초), 토론은 150초로 둬 옛 시계와 안 헷갈림
[[188, 30, 6], [190, 60, 7], [192, 90, 8]].forEach(([no, sec, n]) => {
    test(`A03-E-${no} 모바일 ${n}명 판 투표 ${sec}초 → 투표 단계 처음 남은 시간 ${sec}초(±2) @game`, async ({ user, table }) => {
        const t = await openGame(table, user, n, { dayDiscussionTime: 150, dayVoteTime: sec });
        await toDay(t, user.page);
        await t.advance();
        await expect(abstainButton(user.page)).toBeVisible();
        const shown = await firstClock(user.page, '낮');
        expect(Math.abs(shown - sec)).toBeLessThanOrEqual(2);
    });
});

test('A03-E-194 모바일 6명 판 150자 채팅 → 그대로 보임, 151자는 보내도 안 나감 @game', async ({ user, table }) => {
    const t = await openGame(table, user, 6);
    await toDay(t, user.page);
    const text150 = `e194${Date.now()}${'가'.repeat(150)}`.slice(0, 150);
    await say(user.page, text150);
    await expect(talk.mine(user.page).filter({ hasText: text150 })).toHaveCount(1);
    // 151자: 입력칸엔 들어가고(모음 글 A03-F-207 반장 생각 — 지금 값) 보낼 때 막힘
    const text151 = `x${text150}`;
    await talk.input(user.page).fill(text151);
    await expect(talk.input(user.page)).toHaveValue(text151);
    await talk.send(user.page).click();
    await sleep(CHAT_GAP_MS);
    // 뒤에 보낸 짧은 말이 보이면 앞 151자 처리는 끝난 것
    const marker = `끝${Date.now() % 100000}`;
    await talk.input(user.page).fill(marker);
    await talk.send(user.page).click();
    await expect(talk.mine(user.page).filter({ hasText: marker })).toHaveCount(1);
    await expect(talk.log(user.page).getByText(text151, { exact: true })).toHaveCount(0);
    // 앞 150자로 잘려 나간 것도 없음
    await expect(talk.mine(user.page).filter({ hasText: text151.slice(0, 150) })).toHaveCount(0);
});

test('A03-E-196 모바일 6명 판 0.5초 안에 두 번 → 하나만 보임 @game', async ({ user, table }) => {
    const t = await openGame(table, user, 6);
    await toDay(t, user.page);
    const first = `e196a${Date.now() % 100000}`;
    const second = `e196b${Date.now() % 100000}`;
    await talk.input(user.page).fill(first);
    await talk.send(user.page).click();
    await talk.input(user.page).fill(second);
    await talk.send(user.page).click();
    await expect(talk.mine(user.page).filter({ hasText: first })).toHaveCount(1);
    // 0.5초 지난 뒤 보낸 말이 보이면 앞 두 말 처리는 끝난 것
    await sleep(CHAT_GAP_MS);
    const marker = `e196c${Date.now() % 100000}`;
    await talk.input(user.page).fill(marker);
    await talk.send(user.page).click();
    await expect(talk.mine(user.page).filter({ hasText: marker })).toHaveCount(1);
    await expect(talk.log(user.page).getByText(second, { exact: true })).toHaveCount(0);
});

test('A03-E-198 모바일 6명 판 투표 단계 채팅 → 보임 @game', async ({ user, table }) => {
    const t = await openGame(table, user, 6);
    await toDay(t, user.page);
    await toVote(t, user.page);
    await say(user.page, `투표중${Date.now() % 100000}`);
});
