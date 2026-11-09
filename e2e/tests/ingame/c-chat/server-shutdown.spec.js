// 서버 꺼짐(@shutdown, serial 프로젝트에서만 돎 — 2단계에선 써 두기만): 판 중 점검 안내 → 자동 다시 연결 → 판이 메모리에서 사라져 멀티 화면으로
// 꺼짐은 서버 전체에 걸려 다른 시험과 같이 못 돌림, finally에서 꼭 다시 켜진 걸 확인
const { test, expect } = require('../../../helpers/fixtures');
const servers = require('../../../helpers/servers');
const c = require('./_lib');

const NOTICE = '서버 점검·업데이트로 잠시 연결이 끊깁니다. 잠시 뒤 자동으로 다시 연결돼요.';

async function solo({ user, table, phase = 'DAY', role = 'CITIZEN' }) {
    const t = await c.startGame(table, { humans: [user], bots: 3, roles: ({ bots: b }) => (role === 'JOKER' ? { [user.account.uuid]: 'JOKER' } : { [user.account.uuid]: role, [b[0].account.uuid]: 'JOKER' }) });
    await c.phaseTo(t, phase);
    await c.readyToChat(user.page);
    return t;
}

// 알림 받는 손잡이 붙이고 꺼짐 → 알림 글 목록
// Node 여러 개(E2E_NODES=2)면 그 사람 판 Node만 끔 (판 사람은 모두 판 Node에 붙어 있음), 1개면 예전처럼 4100
async function shutdownWithAlerts(page, uuid) {
    const alerts = [];
    page.on('dialog', (d) => { alerts.push(d.message()); d.accept().catch(() => {}); });
    await servers.triggerShutdown({ uuid });
    return alerts;
}

test('판 중 낮에 서버가 꺼지면 → 인게임 화면에 점검 안내 알림이 뜸 @game @shutdown', async ({ user, table }) => {
    try {
        await solo({ user, table });
        const alerts = await shutdownWithAlerts(user.page, user.account.uuid);
        await expect.poll(() => alerts.includes(NOTICE), { timeout: 20000 }).toBe(true);
    } finally { await servers.waitBackendUp(); }
});

test('밤에 서버가 꺼져도 → 점검 안내 알림이 뜸 @game @shutdown', async ({ user, table }) => {
    try {
        await solo({ user, table, phase: 'NIGHT' });
        const alerts = await shutdownWithAlerts(user.page, user.account.uuid);
        await expect.poll(() => alerts.includes(NOTICE), { timeout: 20000 }).toBe(true);
    } finally { await servers.waitBackendUp(); }
});

test('점검 안내를 받아도 → 로그아웃되지 않고 로그인 화면으로 안 감 @game @shutdown', async ({ user, table }) => {
    try {
        await solo({ user, table });
        const alerts = await shutdownWithAlerts(user.page, user.account.uuid);
        await expect.poll(() => alerts.length, { timeout: 20000 }).toBeGreaterThan(0);
        await expect(user.page).not.toHaveURL(/\/login/);
    } finally { await servers.waitBackendUp(); }
});

test('서버가 다시 켜지면 → 소켓이 알아서 다시 연결됨 (새 소켓 열림) @game @shutdown', async ({ user, table }) => {
    try {
        await solo({ user, table });
        const opened = [];
        user.page.on('websocket', (ws) => { if (ws.url().includes('/socket.io/')) opened.push(Date.now()); });
        const alerts = await shutdownWithAlerts(user.page, user.account.uuid);
        await expect.poll(() => alerts.length, { timeout: 20000 }).toBeGreaterThan(0);
        await servers.waitBackendUp();
        await expect.poll(() => opened.length, { timeout: 60000 }).toBeGreaterThan(0);
    } finally { await servers.waitBackendUp(); }
});

test('서버가 다시 켜지면 → 판이 사라져 멀티 화면으로 보내짐 @game @shutdown', async ({ user, table }) => {
    try {
        await solo({ user, table });
        await shutdownWithAlerts(user.page, user.account.uuid);
        await servers.waitBackendUp();
        await expect(user.page).toHaveURL(/\/multiplay/, { timeout: 60000 });
    } finally { await servers.waitBackendUp(); }
});

test('죽은 사람 채팅 중에 서버가 꺼져도 → 점검 안내 뒤 다시 켜지면 멀티 화면으로 @game @shutdown', async ({ user, table }) => {
    try {
        const t = await solo({ user, table });
        await c.executeByBots(t, user.account.uuid);
        await t.stopBots();
        await c.readyToChat(user.page);
        const alerts = await shutdownWithAlerts(user.page, user.account.uuid);
        await expect.poll(() => alerts.includes(NOTICE), { timeout: 20000 }).toBe(true);
        await servers.waitBackendUp();
        await expect(user.page).toHaveURL(/\/multiplay/, { timeout: 60000 });
    } finally { await servers.waitBackendUp(); }
});

test('두 사람이 같은 판에 있으면 → 둘 다 점검 안내를 받음 @game @shutdown', async ({ user, players, table }) => {
    try {
        const p2 = await players.add();
        const t = await c.startGame(table, { humans: [user, p2], bots: 3, roles: ({ bots: b }) => ({ [user.account.uuid]: 'CITIZEN', [p2.account.uuid]: 'CITIZEN', [b[0].account.uuid]: 'JOKER' }) });
        await c.phaseTo(t, 'DAY');
        const a2 = [];
        p2.page.on('dialog', (d) => { a2.push(d.message()); d.accept().catch(() => {}); });
        const a1 = await shutdownWithAlerts(user.page, user.account.uuid);
        await expect.poll(() => a1.includes(NOTICE) && a2.includes(NOTICE), { timeout: 20000 }).toBe(true);
    } finally { await servers.waitBackendUp(); }
});

test('서버가 꺼지고 켜진 뒤 → 멀티 화면에서 다시 로비로 갈 수 있음(로그인 유지) @game @shutdown', async ({ user, table }) => {
    try {
        await solo({ user, table });
        await shutdownWithAlerts(user.page, user.account.uuid);
        await servers.waitBackendUp();
        await expect(user.page).toHaveURL(/\/multiplay/, { timeout: 60000 });
        await user.page.goto('/lobby');
        await expect(user.page.getByRole('navigation', { name: '로비 메뉴' })).toBeVisible({ timeout: 20000 });
    } finally { await servers.waitBackendUp(); }
});
