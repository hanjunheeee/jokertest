'use strict';

// 모바일 판 골드 브라우저 시험 — 결과판 내 줄 "+1골드"(이긴 편·진 편·죽은 사람), 값 0·2, 남의 줄엔 없음, 상점 잔액·로비 지갑 값, 산 채로 나가면 못 받고 죽은 뒤 나가면 받음
// 목록 A07-승패-결과-골드.md 번호 A07-E-077~083·090~092·140 (판 값 바꾸는 080·081은 @serial이라 serial 프로젝트에서 휴대폰 창으로 돎), 돌리지 않고 모임만: npx playwright test --list --no-deps tests/mobile/a07-gold.spec.js
const { test, expect, E2E } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { customRoleSettings } = require('../../helpers/game');
const { query } = require('../../helpers/db');
const { skipIntro, closeOverlays } = require('../../helpers/ui');
const { createAdmin, loginAsAdmin } = require('../../helpers/adminAccounts');
const { resultRow } = require('../room/roomHelpers');
const { wallet, balance } = require('../store/store-tools');
const { startTalkGame, getExecuted, toDay } = require('./_talk');

// ── 이 파일 도우미 (공용으로 올릴 후보: A07 승패·결과 묶음) ──

const U = (x) => x.account.uuid;
const nick = (x) => x.account.nickname;
const resultBoard = (page) => page.getByRole('region', { name: '가면무도회 참가자 정체' });

// 봇 방장 판은 단계 시간을 가장 길게 둠 — 단계는 손잡이·"다 내면 5초"로만 넘어감 (화면을 누르거나 기다리는 동안 진짜 마감이 먼저 오면 흐름이 엇갈림)
const PACE = Object.freeze({ dayDiscussionTime: 150, dayVoteTime: 90, tribunalTime: 120, nightActionTime: 120 });
const goldChip = (page) => page.getByTestId('game-result-gold-reward');
const myChip = (who) => resultRow(who.page, nick(who)).getByTestId('game-result-gold-reward');

// 서버가 정한 직업이 바라는 대로인지 (예약이 가끔 못 맞음 → 판이 다른 쪽으로 끝나는 것 막기)
function expectRoles(s, wanted) {
    for (const [uuid, role] of Object.entries(wanted)) {
        expect(s.players.find((p) => p.uuid === uuid)?.role, `미리 정한 직업 (${uuid})`).toBe(role);
    }
}

// 판 요약이 조건에 맞을 때까지 (단계는 안 넘김)
async function waitState(t, match, message, timeout = 20_000) {
    let last = null;
    await expect.poll(async () => { last = await t.state(); return last ? match(last) : false; }, { timeout, message }).toBe(true);
    return last;
}

// 봇이 판에서 나가기 (산 채로 나가면 죽은 것으로 바뀌고 바로 승패 확인)
async function botLeave(t, bot) {
    const reply = await bot.request('leave_game_session', { gameId: t.gameId });
    expect(reply?.ok, `봇 나가기 거절: ${reply?.code ?? '답 없음'}`).toBe(true);
}

// 영상 연출 셋 (암살 영상·추방 연출·결과 영상) — "건너뛰기"는 이 안에서만 찾음 (밤 차례의 "건너뛰기" 단추와 안 섞이게)
const VIDEO_COVERS = '[data-ingame-night-success-kill], [data-ingame-tribunal-expulsion], [data-game-result-intro]';

// 화면을 막는 연출 넘기기: 영상이 못 돌 때 뜨는 "건너뛰기", 낮 시작 연출 글 창 "확인"
async function passCovers(page) {
    const skip = page.locator(VIDEO_COVERS).getByRole('button', { name: '건너뛰기' }).first();
    if (await skip.isVisible().catch(() => false)) await skip.click({ timeout: 1000 }).catch(() => {});
    const dawnOk = page.locator('[data-ingame-dawn-report]').getByRole('button', { name: '확인' });
    if (await dawnOk.count() > 0) await dawnOk.first().click({ timeout: 1000 }).catch(() => {});
}

// 결과판이 보일 때까지: 가는 길을 막는 연출만 넘김
async function toResult(page, { timeout = 60_000 } = {}) {
    const list = resultBoard(page);
    await expect(async () => {
        await passCovers(page);
        await expect(list).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout });
    await expect(page).toHaveURL(/\/gameresult/);
    return list;
}

// 판 끝 광고 창(결과가 다 나타나고 1.5초 뒤, 5초 뒤 "닫기")은 결과판을 덮음 → 보임 확인·단추 누르기 전에 닫음 (광고가 꺼진 빌드면 그냥 지나감)
async function closeAd(page) {
    const ad = page.getByRole('dialog', { name: '광고' });
    const shown = await ad.waitFor({ state: 'visible', timeout: 8000 }).then(() => true, () => false);
    if (!shown) return;
    // 광고 꾸러미를 못 받으면 "닫기" 전에 창이 스스로 닫힘 → 닫기 단추가 나오거나 창이 사라지거나 둘 중 하나까지
    const close = ad.getByRole('button', { name: '닫기' });
    await expect(async () => {
        if (await close.isVisible().catch(() => false)) await close.click({ timeout: 2000 });
        await expect(ad).toHaveCount(0, { timeout: 1000 });
    }).toPass({ timeout: 15_000 });
}

// 지갑 골드 (DB) · 그 값이 될 때까지 (판 골드는 판 끝 저장 뒤에 들어옴)
const goldOf = async (uuid) => (await wallet(uuid)).gold;
async function expectGold(uuid, amount) {
    await expect.poll(() => goldOf(uuid), { timeout: 30_000, message: '지갑 골드' }).toBe(amount);
}

// 그 판 판 골드 장부 줄을 받은 사람 uuid (정렬) — 참조 id는 game-reward:<판 id>
async function rewardedUuids(gameId) {
    const rows = await query(
        "SELECT user_id FROM economy_ledger_entries WHERE reason = 'GAME_REWARD' AND reference_event_id = ?",
        [`game-reward:${gameId}`],
    );
    return rows.map((r) => r.user_id).sort();
}
async function expectRewarded(gameId, uuids) {
    await expect.poll(() => rewardedUuids(gameId), { timeout: 30_000, message: '판 골드 장부 줄' }).toEqual([...uuids].sort());
}

// 판 전적이 DB에 저장될 때까지 (판 골드는 그 뒤에 들어옴 → "안 들어옴"을 볼 때 먼저 기다림)
async function expectRecorded(gameId) {
    await expect.poll(async () => (await query('SELECT id FROM game_results WHERE id = ?', [gameId])).length, {
        timeout: 30_000, message: '판 전적 저장',
    }).toBe(1);
}

// n명 판(광대 1, 자동 구성)에서 광대 봇이 나가 시민 승 — 사람은 이긴 편 산 시민 → { t, list } (광고까지 닫음)
async function citizenWinBoard(table, user, n) {
    const me = U(user);
    const t = await startTalkGame(table, user, { bots: n - 1, settings: PACE, roles: ({ bots }) => ({ [me]: 'CITIZEN', [U(bots[0])]: 'JOKER' }) });
    expectRoles(await t.state(), { [me]: 'CITIZEN', [U(t.bots[0])]: 'JOKER' });
    await botLeave(t, t.bots[0]);
    const end = await waitState(t, (g) => g.phase === 'ENDED', '광대가 나가 판 끝');
    expect(end.winResult?.winner, '서버 승자').toBe('CITIZEN');
    const list = await toResult(user.page);
    await closeAd(user.page);
    return { t, list };
}

// n명 판(광대 봇 2, 나머지 시민)에서 시민 봇이 나가 광대 2 : 나머지 2 → 광대 승 — 사람은 진 편 산 시민 → { t, list }
async function jokerWinBoard(table, user, n) {
    const me = U(user);
    const t = await startTalkGame(table, user, {
        bots: n - 1,
        settings: customRoleSettings({ JOKER: 2 }, PACE),
        roles: ({ bots }) => ({ [me]: 'CITIZEN', [U(bots[0])]: 'JOKER', [U(bots[1])]: 'JOKER' }),
    });
    expectRoles(await t.state(), { [me]: 'CITIZEN', [U(t.bots[0])]: 'JOKER', [U(t.bots[1])]: 'JOKER' });
    // 시민 봇 n-4명이 나가면 남는 건 나 + 시민 봇 1 (예: 7명 판 → 봇 2·3·4가 나감)
    for (const bot of t.bots.slice(2, n - 2)) await botLeave(t, bot);
    const end = await waitState(t, (g) => g.phase === 'ENDED', '수가 같아져 판 끝');
    expect(end.winResult?.winner, '서버 승자').toBe('JOKER');
    const list = await toResult(user.page);
    await closeAd(user.page);
    return { t, list };
}

// n명 판에서 내가(시민) 봇 표로 처형돼 관전 → 광대 봇이 나가 시민 승 — 사람은 이긴 편 죽은 사람 → { t, list }
async function deadWatcherBoard(table, user, n) {
    const me = U(user);
    const t = await startTalkGame(table, user, { bots: n - 1, settings: PACE, roles: ({ bots }) => ({ [me]: 'CITIZEN', [U(bots[0])]: 'JOKER' }) });
    expectRoles(await t.state(), { [me]: 'CITIZEN', [U(t.bots[0])]: 'JOKER' });
    await getExecuted(t, me, { pages: [user.page] });
    expect((await t.player(me))?.alive, '나는 처형됨').toBe(false);
    await botLeave(t, t.bots[0]);
    const end = await waitState(t, (g) => g.phase === 'ENDED', '광대가 나가 판 끝');
    expect(end.winResult?.winner, '서버 승자').toBe('CITIZEN');
    const list = await toResult(user.page);
    await closeAd(user.page);
    return { t, list };
}

// 확인 창을 수락하며 fn을 돌림 (나가기·"로비로" 확인)
// 브라우저 확인 창(window.confirm) + 합친 뒤 모바일 양피지 확인 창(appConfirm, alertdialog "확인")도 뜨면 "확인"
async function acceptingConfirm(page, fn) {
    const onDialog = (dialog) => { dialog.accept().catch(() => {}); };
    page.on('dialog', onDialog);
    const parchment = page.getByRole('alertdialog', { name: '확인', exact: true });
    let running = true;
    const clicker = (async () => {
        while (running) {
            if (await parchment.isVisible().catch(() => false)) await parchment.getByRole('button', { name: '확인', exact: true }).click({ timeout: 1000 }).catch(() => {});
            await new Promise((r) => { setTimeout(r, 150); });
        }
    })();
    try {
        return await fn();
    } finally {
        running = false;
        await clicker;
        page.off('dialog', onDialog);
    }
}

// 산 사람이 판에서 나가기: 위 줄 "게임 나가기" → 확인 창 수락 → 방 찾기 화면 (막는 안내 창은 닫으면서)
async function leaveAliveUi(page) {
    await acceptingConfirm(page, () => expect(async () => {
        if (!/\/multiplay/.test(page.url())) {
            await passCovers(page);
            await closeOverlays(page, { keepWatching: false, rounds: 2, clickTimeoutMs: 1000 });
            await page.locator('[aria-label="인게임 컨트롤"]').getByRole('button', { name: '게임 나가기' }).click({ timeout: 1500 }).catch(() => {});
        }
        await expect(page).toHaveURL(/\/multiplay/, { timeout: 4000 });
    }).toPass({ timeout: 30_000 }));
}

// 죽은 뒤 나가기: "사망 후 선택" 창의 "게임 나가기" → 확인 창 수락 → 방 찾기 화면 (처형 연출이 창을 잠깐 가려서 눌릴 때까지)
async function leaveDeadUi(page) {
    const dialog = page.getByRole('dialog', { name: '사망 후 선택' });
    await acceptingConfirm(page, () => expect(async () => {
        if (!/\/multiplay/.test(page.url())) {
            await passCovers(page);
            await closeOverlays(page, { keepWatching: false, rounds: 2, clickTimeoutMs: 1000 });
            await dialog.getByRole('button', { name: '게임 나가기' }).click({ timeout: 2000 }).catch(() => {});
        }
        await expect(page).toHaveURL(/\/multiplay/, { timeout: 4000 });
    }).toPass({ timeout: 45_000 }));
}

// 관리자 창 하나 (PC 크기·관리자 주소) 열고 시험 관리자로 로그인 → { context, page }
async function openAdmin(browser) {
    const context = await browser.newContext({ baseURL: E2E.adminUrl, viewport: { width: 1280, height: 800 }, locale: 'ko-KR', timezoneId: 'Asia/Seoul' });
    const page = await context.newPage();
    await loginAsAdmin(page, await createAdmin());
    return { context, page };
}

// 관리자 API로 판 골드 값 바꾸기 (화면이 보내는 것과 같은 요청: 쓰기 확인 머리글 + 관리자 주소 Origin)
async function setGoldByApi(adminPage, goldReward) {
    const me = await adminPage.request.get(`${E2E.adminUrl}/admin-api/auth/me`);
    expect(me.ok(), '관리자 로그인 확인').toBe(true);
    const { csrfToken } = await me.json();
    const res = await adminPage.request.put(`${E2E.adminUrl}/admin-api/game-settings`, {
        data: { goldReward },
        headers: { 'x-admin-csrf': csrfToken, origin: E2E.adminUrl },
    });
    expect(res.status(), `판 골드 값 ${goldReward} 저장`).toBe(200);
}

// ── 내 줄 "+1골드" (A07-E-077~079) ──

const RECEIVER_CASES = [
    ['A07-E-077', '이긴 편 산 사람', 5, citizenWinBoard, '@game @smoke'],
    ['A07-E-078', '진 편 산 사람', 7, jokerWinBoard, '@game'],
    ['A07-E-079', '죽은 사람', 8, deadWatcherBoard, '@game'],
];

for (const [no, who, n, play, tags] of RECEIVER_CASES) {
    test(`${no} 모바일 ${n}명 판 ${who} → 결과판 내 줄 "+1골드" ${tags}`, async ({ user, table }) => {
        await play(table, user, n);
        await expect(myChip(user)).toHaveText('+1골드');
    });
}

// ── 판 값 0·2 (서버 전체 값이라 다른 시험과 같이 못 돎 → @serial, 끝에 1로 되돌림) ──

test('A07-E-080 모바일 판 골드 값 0 → 6명 판 끝 골드 칸 없음, 지갑 그대로 @game @serial', async ({ browser, players, table }) => {
    const admin = await openAdmin(browser);
    try {
        await setGoldByApi(admin.page, 0);
        const phone = await players.add({ mobile: true });
        const before = await goldOf(U(phone));
        const { t, list } = await citizenWinBoard(table, phone, 6);
        await expect(list.getByRole('listitem')).toHaveCount(6);
        await expect(goldChip(phone.page)).toHaveCount(0);
        await expectRecorded(t.gameId);
        expect(await rewardedUuids(t.gameId), '장부에 판 골드 줄 없음').toEqual([]);
        expect(await goldOf(U(phone)), '지갑 그대로').toBe(before);
    } finally {
        await setGoldByApi(admin.page, 1);
        await admin.context.close();
    }
});

test('A07-E-081 모바일 판 골드 값 2 → 5명 판 끝 내 줄 "+2골드" @game @serial', async ({ browser, players, table }) => {
    const admin = await openAdmin(browser);
    try {
        await setGoldByApi(admin.page, 2);
        const phone = await players.add({ mobile: true });
        const before = await goldOf(U(phone));
        await citizenWinBoard(table, phone, 5);
        await expect(myChip(phone)).toHaveText('+2골드');
        await expectGold(U(phone), before + 2);
    } finally {
        await setGoldByApi(admin.page, 1);
        await admin.context.close();
    }
});

// ── 골드 칸 자리·보임 ──

test('A07-E-082 모바일 7명 판 결과판 → 골드 칸은 내 줄 1개뿐 (남의 줄엔 없음) @game', async ({ user, table }) => {
    const { list } = await citizenWinBoard(table, user, 7);
    await expect(list.getByRole('listitem')).toHaveCount(7);
    await expect(goldChip(user.page)).toHaveCount(1);
    await expect(myChip(user)).toHaveCount(1);
});

test('A07-E-083 모바일 8명 판 결과판 골드 글이 사람 눈에 읽힘 @game @safari', async ({ user, table }) => {
    await citizenWinBoard(table, user, 8);
    await expect(myChip(user)).toHaveText('+1골드');
    await expectReadable(myChip(user));
});

// ── 지갑에 들어옴 ──

test('A07-E-090 모바일 6명 판 끝 뒤 상점 → 골드 잔액 +1 @game', async ({ user, table }) => {
    const page = user.page;
    const me = U(user);
    const before = await goldOf(me);
    await citizenWinBoard(table, user, 6);
    await expectGold(me, before + 1);

    await page.goto('/store');
    await skipIntro(page);
    const shown = balance(page, '골드', before + 1);
    await expect(shown).toBeVisible({ timeout: 15_000 });
    await expectReadable(shown.getByText((before + 1).toLocaleString(), { exact: true }));
});

test('A07-E-091 모바일 7명 판 산 채로 나가기 확인 → 판 끝난 뒤 지갑 그대로, 장부에 내 줄 없음 @game', async ({ user, table }) => {
    const page = user.page;
    const me = U(user);
    const t = await startTalkGame(table, user, { bots: 6, settings: PACE, roles: ({ bots }) => ({ [me]: 'CITIZEN', [U(bots[0])]: 'JOKER' }) });
    expectRoles(await t.state(), { [me]: 'CITIZEN', [U(t.bots[0])]: 'JOKER' });
    const before = await goldOf(me);

    await toDay(t, page);
    await leaveAliveUi(page);
    await waitState(t, (g) => g.players.find((p) => p.uuid === me)?.alive === false, '나간 사람은 죽은 것으로 바뀜');

    // 광대 봇도 나가 시민 승으로 판 끝 → 끝까지 있던 봇 5만 받음
    await botLeave(t, t.bots[0]);
    await waitState(t, (g) => g.phase === 'ENDED', '판 끝');
    await expectRewarded(t.gameId, t.bots.slice(1).map(U));
    expect(await goldOf(me), '탈주한 사람 지갑 그대로').toBe(before);
});

test('A07-E-092 모바일 8명 판 처형된 뒤 나가기 → 판 끝난 뒤 지갑 +1 @game', async ({ user, table }) => {
    const page = user.page;
    const me = U(user);
    const t = await startTalkGame(table, user, { bots: 7, settings: PACE, roles: ({ bots }) => ({ [me]: 'CITIZEN', [U(bots[0])]: 'JOKER' }) });
    expectRoles(await t.state(), { [me]: 'CITIZEN', [U(t.bots[0])]: 'JOKER' });
    const before = await goldOf(me);

    // 봇 표로 내가 처형 → "사망 후 선택" 창에서 "게임 나가기"
    await getExecuted(t, me, { keepWatching: false, pages: [page] });
    await leaveDeadUi(page);

    // 내가 없는 채로 판이 끝남 (광대 봇이 나가 시민 승) → 나도 받음
    await botLeave(t, t.bots[0]);
    await waitState(t, (g) => g.phase === 'ENDED', '판 끝');
    await expectRewarded(t.gameId, [me, ...t.bots.slice(1).map(U)]);
    await expectGold(me, before + 1);
});

test('A07-E-140 모바일 6명 판 끝 → "로비로" → 로비가 받아 온 지갑 골드 +1 @game', async ({ user, table }) => {
    const page = user.page;
    const me = U(user);
    const before = await goldOf(me);
    await citizenWinBoard(table, user, 6);
    await expectGold(me, before + 1);

    // 로비 화면엔 골드 숫자 칸이 없음 → 로비에 들어오며 받아 온 지갑 값(서버 답)으로 봄
    const walletSeen = page.waitForResponse((res) => res.url().includes(`/economy/accounts/${me}/wallet`) && res.ok(), { timeout: 20_000 });
    await acceptingConfirm(page, async () => {
        await page.getByRole('button', { name: '로비로', exact: true }).click();
        await expect(page).toHaveURL(/\/lobby/, { timeout: 15_000 });
    });
    const body = await (await walletSeen).json();
    expect(body.balanceGold, '로비가 받은 골드').toBe(before + 1);
    await skipIntro(page);
    await expect(page.getByRole('navigation', { name: '로비 메뉴' })).toBeVisible();
});
