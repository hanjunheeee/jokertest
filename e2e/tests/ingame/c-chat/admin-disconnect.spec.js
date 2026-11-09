// 관리자 즉시 끊기(internal disconnect)와 정지 계정: 판 중 화면 알림·로그인 화면·다시 못 들어옴·남은 사람 판은 계속
// 정지 줄은 시험 계정에만 넣음 (계정은 실행 끝에 지워짐)
const { test, expect, ui } = require('../../../helpers/fixtures');
const c = require('./_lib');
const db = require('../../../helpers/db');
const { E2E } = require('../../../helpers/env');

const BANNED = '정지된 계정입니다. 운영정책을 확인해주세요.';
const ADMIN = '운영자에 의해 연결이 종료되었습니다.';

async function setup({ user, table, players, withP2 = false }) {
    const alerts = [];
    user.page.on('dialog', (d) => { alerts.push(d.message()); d.accept().catch(() => {}); });
    const p2 = withP2 ? await players.add() : null;
    const humans = p2 ? [user, p2] : [user];
    const t = await c.startGame(table, { humans, bots: 3, roles: ({ bots: b }) => ({ [user.account.uuid]: 'CITIZEN', [b[0].account.uuid]: 'JOKER', ...(p2 ? { [p2.account.uuid]: 'CITIZEN' } : {}) }) });
    await c.phaseTo(t, 'DAY');
    await c.readyToChat(user.page);
    return { t, p2, alerts };
}

async function ban(uuid, { permanent = false, endInMs = 24 * 3600 * 1000, startInMs = -60000, reason = '시험 정지' } = {}) {
    // 시각은 DB NOW() 기준으로 (도우미 DB 연결 시간대가 서버와 달라 JS Date를 넣으면 9시간 어긋남)
    await db.query(
        'INSERT INTO user_bans (user_id, reason, is_permanent, start_at, end_at, created_at) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND), ' + (permanent ? 'NULL' : 'DATE_ADD(NOW(), INTERVAL ? SECOND)') + ', NOW())',
        permanent ? [uuid, reason, 1, Math.round(startInMs / 1000)] : [uuid, reason, 0, Math.round(startInMs / 1000), Math.round(endInMs / 1000)],
    );
}

test.describe('관리자 즉시 끊기 (정지 없음)', () => {
    test('판 중에 관리자가 끊으면 → "운영자에 의해 연결이 종료되었습니다." 알림이 뜸 @game', async ({ user, table, players }) => {
        const { alerts } = await setup({ user, table, players });
        await internal_disconnect(user.account.uuid);
        await expect.poll(() => alerts.includes(ADMIN), { timeout: 15000 }).toBe(true);
    });

    test('관리자가 끊으면 → 로그인 화면으로 감 @game', async ({ user, table, players }) => {
        await setup({ user, table, players });
        await internal_disconnect(user.account.uuid);
        await expect(user.page).toHaveURL(/\/login/, { timeout: 15000 });
    });

    test('관리자 끊기 응답은 → 코드 ADMIN_DISCONNECT·끊은 소켓 1개 @game', async ({ user, table, players, internal }) => {
        await setup({ user, table, players });
        const r = await internal.disconnect(user.account.uuid);
        expect(r.code).toBe('ADMIN_DISCONNECT');
        expect(r.disconnected).toBeGreaterThanOrEqual(1);
    });

    test('정지 없이 끊긴 사람은 → 다시 로그인하면 /ingame으로 판에 돌아옴(같은 단계 안) @game', async ({ user, table, players }) => {
        const { t } = await setup({ user, table, players });
        await internal_disconnect(user.account.uuid);
        await expect(user.page).toHaveURL(/\/login/, { timeout: 15000 });
        await ui.loginViaApi(user.context, user.account);
        await user.page.goto('/ingame');
        await c.readyToChat(user.page);
        expect((await t.player(user.account.uuid)).isParticipating).toBe(true);
    });

    test('내가 끊겨도 → p2는 계속 낮 채팅을 주고받음 @game', async ({ user, table, players }) => {
        const { t, p2 } = await setup({ user, table, players, withP2: true });
        await internal_disconnect(user.account.uuid);
        await expect(user.page).toHaveURL(/\/login/, { timeout: 15000 });
        const text = c.uniq('남은사람');
        await c.say(p2.page, text);
        await expect.poll(() => c.botGot(t, 1, 'day_chat_message_received', text)).toBe(true);
    });

    test('접속 안 한 계정을 끊으면 → 끊은 소켓 0개로 답함', async ({ accounts, internal }) => {
        const acc = await accounts.create();
        const r = await internal.disconnect(acc.uuid);
        expect(r.disconnected).toBe(0);
    });

    test('uuid 모양이 아닌 값으로 끊으면 → 400', async ({ internal }) => {
        const r = await internal.raw('POST', '/internal/users/not-a-uuid/disconnect');
        expect(r.status).toBe(400);
    });

    test('열쇠 없이 끊기를 부르면 → 막힘(401·403)', async ({ accounts }) => {
        const acc = await accounts.create();
        const res = await fetch(`${E2E.apiUrl}/internal/users/${acc.uuid}/disconnect`, { method: 'POST' });
        expect([401, 403, 404]).toContain(res.status);
    });
});

test.describe('정지 계정', () => {
    test('판 중에 정지 줄을 넣고 끊으면 → "정지된 계정입니다" 알림이 뜸 @game', async ({ user, table, players }) => {
        const { alerts } = await setup({ user, table, players });
        await ban(user.account.uuid);
        await internal_disconnect(user.account.uuid);
        await expect.poll(() => alerts.includes(BANNED), { timeout: 15000 }).toBe(true);
    });

    test('정지되어 끊기면 → 로그인 화면으로 감 @game', async ({ user, table, players }) => {
        await setup({ user, table, players });
        await ban(user.account.uuid);
        await internal_disconnect(user.account.uuid);
        await expect(user.page).toHaveURL(/\/login/, { timeout: 15000 });
    });

    test('정지 끊기 응답은 → 코드 ACCOUNT_BANNED @game', async ({ user, table, players, internal }) => {
        await setup({ user, table, players });
        await ban(user.account.uuid);
        const r = await internal.disconnect(user.account.uuid);
        expect(r.code).toBe('ACCOUNT_BANNED');
    });

    test('영구 정지도 → 코드 ACCOUNT_BANNED로 끊김 @game', async ({ user, table, players, internal }) => {
        await setup({ user, table, players });
        await ban(user.account.uuid, { permanent: true });
        const r = await internal.disconnect(user.account.uuid);
        expect(r.code).toBe('ACCOUNT_BANNED');
    });

    test('이미 끝난 정지 줄만 있으면 → 코드 ADMIN_DISCONNECT로 끊김 @game', async ({ user, table, players, internal }) => {
        await setup({ user, table, players });
        await ban(user.account.uuid, { startInMs: -7200000, endInMs: -3600000 });
        const r = await internal.disconnect(user.account.uuid);
        expect(r.code).toBe('ADMIN_DISCONNECT');
    });

    test('정지되어 끊긴 뒤 옛 쿠키로 /ingame을 열면 → 판에 못 들어가고 로그인 화면 @game', async ({ user, table, players }) => {
        await setup({ user, table, players });
        await ban(user.account.uuid);
        await internal_disconnect(user.account.uuid);
        await expect(user.page).toHaveURL(/\/login/, { timeout: 15000 });
        await user.page.goto('/ingame');
        await expect(user.page).not.toHaveURL(/\/ingame/, { timeout: 15000 });
    });

    test('정지된 계정으로 로그인하면 → "정지된 계정입니다. 사유:" 알림이 뜨고 로비로 못 감', async ({ accounts, page }) => {
        const acc = await accounts.create();
        await ban(acc.uuid, { reason: '욕설' });
        await page.goto('/login');
        await page.getByPlaceholder('이메일을 입력하세요').fill(acc.email);
        await page.getByPlaceholder('비밀번호를 입력하세요').fill(acc.password);
        const message = await ui.captureAlert(page, () => page.getByRole('button', { name: '로그인', exact: true }).click());
        expect(message).toMatch(/정지된 계정입니다/);
        await expect(page).not.toHaveURL(/\/lobby/);
    });

    test('정지되어 끊긴 채 단계가 넘어가면 → 서버 판에서 빠짐 @game', async ({ user, table, players }) => {
        const { t } = await setup({ user, table, players });
        await ban(user.account.uuid);
        await internal_disconnect(user.account.uuid);
        await expect(user.page).toHaveURL(/\/login/, { timeout: 15000 });
        await c.phaseTo(t, 'NIGHT'); // 끊긴 단계(낮)가 바뀌어야 유예가 끝남
        await expect.poll(async () => (await t.player(user.account.uuid))?.isParticipating, { timeout: 15000 }).toBe(false);
    });

    test('판 중 정지 줄만 넣어도(끊기 안 부름) → 5초 주기 검사로 끊겨 로그인 화면 @game', async ({ user, table, players }) => {
        await setup({ user, table, players });
        await ban(user.account.uuid);
        await expect(user.page).toHaveURL(/\/login/, { timeout: 25000 });
    });
});

// 관리자 끊기 (helpers/internal 모듈 그대로)
function internal_disconnect(uuid) {
    return require('../../../helpers/internal').internal.disconnect(uuid);
}

test('관리자가 끊은 뒤 단계가 넘어가면 → p2 화면의 내 카드가 사망으로 바뀜 @game', async ({ user, table, players }) => {
    const { t, p2 } = await setup({ user, table, players, withP2: true });
    await internal_disconnect(user.account.uuid);
    await expect(user.page).toHaveURL(/\/login/, { timeout: 15000 });
    await c.phaseTo(t, 'NIGHT'); // 끊긴 단계(낮)가 바뀌어야 유예가 끝남
    await c.dismissOverlays(p2.page);
    await expect(p2.page.locator(`[data-ingame-player-nickname="${user.account.nickname}"]`)).toHaveAttribute('data-ingame-player-status', 'dead', { timeout: 20000 });
});
