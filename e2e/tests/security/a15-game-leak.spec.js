'use strict';

// 판 안 정보가 화면 소켓 값·화면 글·브라우저 저장소 어디에도 안 새는지 브라우저 시험 (PC) — 사람 자리마다 1일 처형·1일 밤 암살·2일 낮 시작까지 받은 글 전부를 봄
// 목록 A15-보안.md 번호 A15-E-001~010·015~017 (쓰는 동안 안 돌림: npx playwright test --list tests/security/a15-game-leak.spec.js)
const { test, expect, E2E } = require('../../helpers/fixtures');
const k = require('./_a15-kit');

const { n } = k;
const C = (count) => Array(count).fill('CITIZEN');
const uid = (who) => who.account.uuid;

// 6명 J1D1C4 / 10명 J2D2G2W2C2 방 설정 (시민은 남는 자리)
const SIX = { JOKER: 1, DOCTOR: 1 };
const TEN = { JOKER: 2, DOCTOR: 2, GUARD: 2, WITCH_HUNTER: 2 };

const { seatCase, outsiderCase } = k;

// A15-E-001~005: 6명 J1D1C4
test('A15-E-001 6명 J1D1C4 산 시민 자리: 판 시작~2일 낮까지 받은 글에 남의 직업 없음 @game @smoke', async ({ user, table }) => {
    test.setTimeout(240_000);
    await seatCase(table, user, { counts: SIX, me: 'CITIZEN', botRoles: ['JOKER', 'DOCTOR', ...C(3)], execute: 2, victim: 3 });
});

test('A15-E-002 6명 J1D1C4 산 광대 자리: 받은 글에 남의 직업 없음 (광대 1명이라 동료 없음) @game', async ({ user, table }) => {
    test.setTimeout(240_000);
    await seatCase(table, user, { counts: SIX, me: 'JOKER', botRoles: ['DOCTOR', ...C(4)], execute: 1, victim: null });
});

test('A15-E-003 6명 J1D1C4 1일 처형된 사람 자리: 받은 글에 남의 직업 없음 @game', async ({ user, table }) => {
    test.setTimeout(240_000);
    await seatCase(table, user, { counts: SIX, me: 'CITIZEN', botRoles: ['JOKER', 'DOCTOR', ...C(3)], execute: 'me', victim: 2 });
});

test('A15-E-004 6명 J1D1C4 1일 밤에 죽은 사람 자리: 받은 글에 남의 직업 없음 @game', async ({ user, table }) => {
    test.setTimeout(240_000);
    await seatCase(table, user, { counts: SIX, me: 'CITIZEN', botRoles: ['JOKER', 'DOCTOR', ...C(3)], execute: 2, victim: 'me' });
});

test('A15-E-005 6명 J1D1C4 판 밖 사람(로비): 봇 판이 도는 동안 받은 판 글 0개 @game', async ({ user, table }) => {
    test.setTimeout(240_000);
    await outsiderCase(table, user, { counts: SIX, botRoles: ['JOKER', 'DOCTOR', ...C(4)], execute: 2, victim: 3 });
});

// A15-E-006~010: 10명 J2D2G2W2C2
test('A15-E-006 10명 J2D2G2W2C2 산 시민 자리: 받은 글에 남의 직업 없음 @game', async ({ user, table }) => {
    test.setTimeout(240_000);
    await seatCase(table, user, {
        counts: TEN, me: 'CITIZEN', botRoles: ['JOKER', 'JOKER', 'DOCTOR', 'DOCTOR', 'GUARD', 'GUARD', 'WITCH_HUNTER', 'WITCH_HUNTER', 'CITIZEN'], execute: 4, victim: 6,
    });
});

test('A15-E-007 10명 J2D2G2W2C2 산 광대 자리: 받은 글에 남의 직업 없음, 동료 목록엔 광대 봇만 @game', async ({ user, table }) => {
    test.setTimeout(240_000);
    await seatCase(table, user, {
        counts: TEN, me: 'JOKER', botRoles: ['JOKER', 'DOCTOR', 'DOCTOR', 'GUARD', 'GUARD', 'WITCH_HUNTER', 'WITCH_HUNTER', ...C(2)], execute: 3, victim: 5,
    });
});

test('A15-E-008 10명 J2D2G2W2C2 1일 처형된 사람(경비원) 자리: 받은 글에 남의 직업 없음 @game', async ({ user, table }) => {
    test.setTimeout(240_000);
    await seatCase(table, user, {
        counts: TEN, me: 'GUARD', botRoles: ['JOKER', 'JOKER', 'DOCTOR', 'DOCTOR', 'GUARD', 'WITCH_HUNTER', 'WITCH_HUNTER', ...C(2)], execute: 'me', victim: 5,
    });
});

test('A15-E-009 10명 J2D2G2W2C2 1일 밤에 죽은 사람(마녀사냥꾼) 자리: 받은 글에 남의 직업 없음 @game', async ({ user, table }) => {
    test.setTimeout(240_000);
    await seatCase(table, user, {
        counts: TEN, me: 'WITCH_HUNTER', botRoles: ['JOKER', 'JOKER', 'DOCTOR', 'DOCTOR', 'GUARD', 'GUARD', 'WITCH_HUNTER', ...C(2)], execute: 4, victim: 'me',
    });
});

test('A15-E-010 10명 J2D2G2W2C2 판 밖 사람(로비): 봇 판이 도는 동안 받은 판 글 0개 @game', async ({ user, table }) => {
    test.setTimeout(240_000);
    await outsiderCase(table, user, {
        counts: TEN, botRoles: ['JOKER', 'JOKER', 'DOCTOR', 'DOCTOR', 'GUARD', 'GUARD', 'WITCH_HUNTER', 'WITCH_HUNTER', ...C(2)], execute: 4, victim: 6,
    });
});

// 내게만 오는 밤 결과 창 (경비원 조사·마녀사냥꾼 확인)
const privateResult = (page) => page.locator('[data-ingame-night-private-result]');

test('A15-E-015 8명 판 봇 경비원이 사람 시민을 조사 → 2일 낮까지 사람 화면 글·받은 값에 조사 흔적 없음 @game', async ({ user, table }) => {
    test.setTimeout(240_000);
    const frames = k.watchFrames(user.page);
    const { t } = await k.setupGame(table, {
        humans: [user], bots: 7, counts: { JOKER: 1, DOCTOR: 1, GUARD: 1 }, humanRoles: ['CITIZEN'], botRoles: ['GUARD', 'JOKER', 'DOCTOR', ...C(4)],
    });
    const guard = t.bots[0];
    // 1일 낮은 아무도 안 냄(모두 기권) → 1일 밤 경비원 차례에 봇 경비원이 사람을 조사
    await n.toTurn(t, 'GUARD', { dayIndex: 1 });
    const reply = await n.botNight(t, guard, uid(user));
    expect(reply?.ok, `봇 경비원 조사를 서버가 받음 (${reply?.code})`).toBe(true);
    const s = await n.toDay(t, { dayIndex: 2 });
    // 조사한 쪽엔 결과가 감 (조사가 실제로 있었는지)
    await expect.poll(() => n.eventsOf(guard, 'night_action_result').filter((r) => r.targetId === uid(user)).length).toBe(1);
    await k.waitFrame(frames, 'night_result_applied');
    expect(frames.filter((f) => f.event === 'night_action_result'), '사람이 받은 밤 결과(조사 결과)').toEqual([]);
    await expect(user.page.locator('[data-ingame-player-nickname]').first()).toBeVisible();
    await expect(privateResult(user.page)).toHaveCount(0);
    k.expectNoLeak(frames, s, uid(user), { needTribunal: false });
});

test('A15-E-016 10명 판 1일 처형된 사람 시민을 2일 밤 봇 마녀사냥꾼이 확인 → 3일 낮까지 그 사람 화면 글·받은 값에 흔적 없음 @game', async ({ user, table }) => {
    test.setTimeout(300_000);
    const frames = k.watchFrames(user.page);
    const { t } = await k.setupGame(table, {
        humans: [user], bots: 9, counts: TEN, humanRoles: ['CITIZEN'],
        botRoles: ['WITCH_HUNTER', 'JOKER', 'JOKER', 'DOCTOR', 'DOCTOR', 'GUARD', 'GUARD', 'WITCH_HUNTER', 'CITIZEN'],
    });
    const hunter = t.bots[0];
    // 1일 사람 처형, 1일 밤 암살 없음 → 2일 낮은 모두 기권 → 2일 밤 마녀사냥꾼 차례
    await k.playDayNight(t, { execute: uid(user), victim: null });
    await n.toTurn(t, 'WITCH_HUNTER', { dayIndex: 2 });
    const reply = await n.botNight(t, hunter, uid(user));
    expect(reply?.ok, `봇 마녀사냥꾼 확인을 서버가 받음 (${reply?.code})`).toBe(true);
    const s = await n.toDay(t, { dayIndex: 3 });
    await expect.poll(() => n.eventsOf(hunter, 'night_action_result').filter((r) => r.targetId === uid(user)).length).toBe(1);
    await expect.poll(() => frames.filter((f) => f.event === 'night_result_applied').length, { timeout: 15_000 }).toBeGreaterThanOrEqual(2);
    expect(frames.filter((f) => f.event === 'night_action_result'), '죽은 사람이 받은 밤 결과(확인 결과)').toEqual([]);
    await expect(privateResult(user.page)).toHaveCount(0);
    k.expectNoLeak(frames, s, uid(user));
});

test('A15-E-017 6명 판 1일 밤: 화면 저장소(localStorage·sessionStorage)에 남의 직업·토큰 없음 @game', async ({ user, table }) => {
    test.setTimeout(240_000);
    const { t } = await k.setupGame(table, { humans: [user], bots: 5, counts: SIX, humanRoles: ['DOCTOR'], botRoles: ['JOKER', ...C(4)] });
    const s = await n.toNight(t, { dayIndex: 1 });
    await expect(user.page).toHaveURL(/\/ingame/);
    // 쿠키 값(로그인 토큰) 그대로도 저장소에 없어야 함
    const tokens = (await user.context.cookies(E2E.apiUrl))
        .filter((c) => c.name === 'accessToken' || c.name === 'refreshToken').map((c) => c.value);
    expect(tokens.length, '로그인 쿠키가 있음 (준비 확인)').toBeGreaterThan(0);
    const rows = await k.expectStorageClean(user.page, { secrets: [...tokens, user.account.password] });
    // 저장된 값 중 글 묶음(JSON)은 받은 글과 같은 잣대로: 남의 uuid와 직업이 같이 있거나 숨길 칸이 있으면 샌 것
    const asFrames = rows.map((r) => {
        try { return { event: `${r.area}:${r.key}`, data: JSON.parse(r.value) }; } catch { return { event: `${r.area}:${r.key}`, data: r.value }; }
    });
    // 로그인 저장(auth-storage)의 user.role = 내 계정 권한(USER·ADMIN), 판 직업 아님 → 직업 이름이 아닐 때만 빼고 봄
    const gameRoles = new Set(Object.values(k.rolesOf(s)));
    for (const f of asFrames) {
        const me = f.event === 'local:auth-storage' ? f.data?.state?.user : null;
        if (!me || !Object.hasOwn(me, 'role')) continue;
        expect(gameRoles.has(me.role), `auth-storage user.role "${me.role}"는 계정 권한이어야 함`).toBe(false);
        delete me.role;
    }
    const mates = k.sameRoleMates(s, uid(user));
    expect(k.leaksFor(asFrames, { viewer: uid(user), roles: k.rolesOf(s), allies: mates }), '저장소에 남의 직업').toEqual([]);
});
