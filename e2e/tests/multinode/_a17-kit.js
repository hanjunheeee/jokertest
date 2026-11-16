'use strict';

// A17 서버 2대 브라우저 시험 도구 모음 파일, 정한 서버 로비에 사람 열기(서버 힌트 바꾸기)·봇 방장 판 차리기·서버 하나에 바로 묻기·서버 비우기 풀기·Redis 멈추기/풀기·관리자 창
// tests/multinode/a17-*.spec.js·multinode/mobile/a17-*.spec.js만 씀 (이름이 .spec이 아니라 시험으로 안 돎, 공용 도우미는 안 고치고 불러만 씀)
const { execFileSync } = require('node:child_process');
const mn = require('./_mn');
const { DESKTOP, MOBILE, ui } = require('../../helpers/fixtures');
const accountsLib = require('../../helpers/accounts');
const servers = require('../../helpers/servers');
const { call } = require('../../helpers/internal');
const { Table, fitMaxPlayers } = require('../../helpers/game');
const { query } = require('../../helpers/db');
const { api, botApi } = require('../../helpers/friends');
const { createAdmin, loginAsAdmin } = require('../../helpers/adminAccounts');
const { closeReveals, hostGame, resultRow } = require('../room/roomHelpers');
const L = require('../lobby/lobbyHelpers');
const K8 = require('../result/_a08-hard-kit');

const { expect, E2E, NODE_IDS, e2e, internal } = mn;
// 서버 ㄱ·ㄴ (서버 2대 설정의 첫째·둘째 서버 이름)
const [N1, N2] = NODE_IDS;

const U = (x) => x.account?.uuid ?? x.uuid;
const nick = (x) => x.account?.nickname ?? x.nickname;

// 단계가 저절로 안 넘어가게 서버가 받는 가장 긴 시간 (단계는 손잡이로만 넘김)
const PACE = Object.freeze({ dayDiscussionTime: 150, dayVoteTime: 90, tribunalTime: 120, nightActionTime: 120 });

// 화면 글 (화면 코드에서 확인: roomJoinMessages.js·connectionSocket.js·useGameResultReturnToMatching.js·useSocket.js·서버 connection/replace.js·services/ops/disconnect.js)
const TEXT = Object.freeze({
    // 판 중 코드 입장 거절 글 앞머리 (서버 글 "…방입니다."와 화면 글 "…방이라 입장할 수 없습니다."가 같이 가진 말)
    started: '이미 게임이 시작된 방',
    // 없는 코드(ROOM_CODE_MISMATCH)일 때 화면이 보이는 글
    noRoom: '입장 코드가 올바르지 않습니다. 코드를 다시 확인해주세요.',
    full: '방 정원이 가득 찼습니다.',
    nodeGone: '방을 찾을 수 없습니다. 잠시 후 다시 시도해주세요.',
    clusterDown: '지금은 방 위치를 확인할 수 없습니다. 잠시 후 다시 시도해주세요.',
    draining: '서버 점검 준비 중이라 대기방으로 돌아갈 수 없습니다.',
    shutdown: '서버 점검·업데이트로 잠시 연결이 끊깁니다. 잠시 뒤 자동으로 다시 연결돼요.',
    sameBrowser: '같은 브라우저의 다른 창에서 접속해 현재 창의 연결이 종료되었습니다.',
    otherLogin: '다른 기기 또는 브라우저에서 로그인되어 현재 접속이 종료되었습니다.',
    adminCut: '운영자에 의해 연결이 종료되었습니다.',
    maintenanceEnded: '점검으로 판이 끝났어요',
    loginLocked: '비밀번호를 5회 잘못 입력하여 15분간 계정이 잠깁니다.',
    // 첫 탈주 막힘 글 (5분 안 어느 때든)
    desertedFirst: /^탈주로 4분 \d{1,2}초 뒤에 참여할 수 있습니다\.$/,
    // 같은 날 두 번째 탈주 막힘 글 (30분에서 조금 지난 값)
    desertedSecond: /^탈주로 29분 \d{1,2}초 뒤에 참여할 수 있습니다\.$/,
});

// ── 사람 열기: 서버 힌트를 시험이 바꿀 수 있게 ──

// 화면이 다음에 붙을 서버 이름을 적어 두는 쿠키 (시험만 씀, 서버는 안 읽음)
const PIN_COOKIE = 'a17pin';
const NO_PIN = 'none';
// 화면이 기억하는 서버 힌트 자리 (frontend shared/socket/nodeHint.js)
const HINT_KEY = 'mmc.node';

// 화면이 뜰 때마다 도는 글: 쿠키에 적힌 서버(없으면 처음 정한 서버)를 서버 힌트로 넣음 → 첫 접속이 그 서버로 감
// 방·판에 들어가 서버가 옮겨 붙여도, 새로고침하면 다시 이 서버부터 두드림 (= "다른 서버 로비에서 출발한 사람")
function pinScript([cookieName, hintKey, uuid, firstNode, noPin]) {
    try {
        const found = document.cookie.split('; ').find((c) => c.startsWith(`${cookieName}=`));
        const node = found ? found.slice(cookieName.length + 1) : firstNode;
        if (node && node !== noPin) sessionStorage.setItem(hintKey, JSON.stringify({ uuid, node }));
    } catch { /* 저장소·쿠키 막힘 (빈 화면 등) */ }
}

const test = mn.test.extend({
    /**
     * 정한 서버 로비에 사람 하나: const me = await crowd.on(N2, { mobile?, account?, lobby? })
     * → { account, context, page, node, pin(node), unpin() } — pin은 다음 화면 열기·새로고침부터 그 서버를 먼저 두드림, unpin은 힌트를 안 건드림
     * (공용 onNode.person은 힌트가 처음 서버로 굳어 있어 "힌트를 다른 서버로 바꾸고 다시 열기"를 못 함)
     */
    crowd: async ({ browser }, use, testInfo) => {
        const opened = [];
        const phone = testInfo.project.name.startsWith('mobile');
        await use({
            on: async (node, { mobile = phone, account = null, lobby = true } = {}) => {
                const acc = account ?? await accountsLib.createAccount();
                const context = await browser.newContext(mobile ? MOBILE : DESKTOP);
                opened.push(context);
                await context.addInitScript(pinScript, [PIN_COOKIE, HINT_KEY, acc.uuid, node, NO_PIN]);
                const page = await context.newPage();
                await ui.loginViaApi(context, acc);
                if (lobby) await ui.gotoLobby(page);
                const pin = (next) => context.addCookies([{ name: PIN_COOKIE, value: next ?? NO_PIN, url: E2E.desktopUrl }]);
                return { account: acc, context, page, node, pin, unpin: () => pin(null) };
            },
        });
        await Promise.all(opened.map((c) => c.close().catch(() => {})));
    },
});

/** 그 화면이 기억하는 서버 힌트 (없으면 null) */
const hintOf = (page) => page.evaluate((key) => {
    try { return JSON.parse(sessionStorage.getItem(key) ?? 'null')?.node ?? null; } catch { return null; }
}, HINT_KEY);

/** 그 화면의 서버 힌트 지우기 (힌트 없이 다시 붙는 길을 볼 때, unpin과 같이 씀) */
const dropHint = (page) => page.evaluate((key) => sessionStorage.removeItem(key), HINT_KEY);

/** 사람을 그 서버 로비로: 힌트를 그 서버로 바꾸고 로비를 다시 엶 → 힌트가 그대로인지(서버가 다른 곳으로 안 돌려보냄) */
async function lobbyOn(person, node, page = person.page) {
    await person.pin(node);
    await ui.gotoLobby(page);
    await expect.poll(() => hintOf(page), { message: `로비 서버 힌트 = ${node}` }).toBe(node);
}

// ── 판 차리기 ──

/**
 * 봇 방장 판 차리기 (판은 방장 봇이 붙은 서버에서 돎): 봇·사람 코드 입장 → 준비 → 직업 예약 → 시작
 * 다른 서버에 붙어 있던 봇·사람은 입장할 때 방이 있는 서버로 옮겨 붙음
 * 직업을 안 주면 사람은 시민·광대는 맨 뒤 봇 (방장 봇은 판 끝까지 남게 광대로 안 둠 → 봇 2 이상)
 * @returns {Promise<{ t:import('../../helpers/game').Table, host:any, joker:any|null, room:object }>} joker = 서버 값으로 찾은 광대 봇
 */
async function startGame({ hostBot, otherBots = [], people = [], settings = {}, roles = null, reveal = true }) {
    const botList = [hostBot, ...otherBots];
    const total = botList.length + people.length;
    if (total < 5) throw new Error(`판은 5명 이상이어야 함 (지금 ${total}명)`);
    if (!roles && botList.length < 2) throw new Error('직업을 안 주면 광대로 둘 봇이 따로 있어야 함 (봇 2 이상)');
    const room = await hostBot.createRoom({ maxPlayers: fitMaxPlayers(total), ...PACE, ...settings });
    for (const bot of otherBots) await bot.joinByCode(room.roomCode);
    for (const who of people) await ui.joinRoomByCodeUi(who.page, room.roomCode);
    const live = await e2e.roomOf(U(hostBot));
    for (const bot of botList) await bot.setReady(live.roomId, live.settingsVersion);
    for (const who of people) await ui.readyUi(who.page);
    const plan = roles ?? K8.rolesFor(people, [botList.at(-1)]);
    await e2e.setRoles(plan, { roomId: live.roomId });
    const started = await hostBot.startGame(live.roomId, live.settingsVersion);
    for (const who of people) await expect(who.page).toHaveURL(/\/ingame/, { timeout: 20_000 });
    const t = new Table({ room, bots: botList, humans: people });
    t.gameId = started.gameId;
    const s = await K8.expectRoles(t.gameId, plan);
    expect(s.players.length, '판 인원').toBe(total);
    if (reveal && people.length > 0) await closeReveals(people.map((p) => p.page));
    const jokerUuid = s.players.find((p) => p.role === 'JOKER')?.uuid;
    const joker = botList.find((bot) => U(bot) === jokerUuid) ?? null;
    return { t, host: hostBot, joker, room };
}

/**
 * 사람 방장 판 차리기 (PC 화면으로 방 만듦 → 방은 방장이 붙은 서버에): 사람은 시민·광대는 맨 뒤 봇
 * @param {object} settings 설정 화면 칸 (roomHelpers fillSettings: code·maxPlayers 등)
 * @returns {Promise<{ t:any, joker:any }>}
 */
async function startHosted({ host, guests = [], botList = [], settings = {} }) {
    const roles = K8.rolesFor([host, ...guests], [botList.at(-1)]);
    const t = await hostGame({ host, guests, botList, roles, settings });
    await K8.expectRoles(t.gameId, roles);
    await closeReveals([host, ...guests].map((p) => p.page));
    return { t, joker: botList.at(-1) };
}

/** 광대 봇이 나가 시민 승으로 판 끝 (하나뿐인 광대가 나가면 바로 승패가 남, 그 봇은 탈주라 뒤에 못 씀) */
async function endByJoker(t, joker) {
    await K8.jokerLeaves(t, joker);
    await expect.poll(async () => (await t.state())?.phase ?? 'GONE', { timeout: 20_000, message: '광대가 나가 판 끝' }).toBe('ENDED');
}

/** 결과판 내 줄의 판 골드 표시 ("+1골드") */
const goldChip = (page, nickname) => resultRow(page, nickname).getByTestId('game-result-gold-reward');

/** 그 판 판 골드 장부 줄을 받은 사람 uuid (정렬, 같은 사람이 두 줄이면 두 번 나옴) — 참조 id는 game-reward:<판 id> */
async function rewardedUuids(gameId) {
    const rows = await query(
        "SELECT user_id FROM economy_ledger_entries WHERE reason = 'GAME_REWARD' AND reference_event_id = ?",
        [`game-reward:${gameId}`],
    );
    return rows.map((r) => r.user_id).sort();
}

// ── 서버 하나에 바로 묻기 (앞단을 안 거침) ──

const nodeUrl = (id) => E2E.nodes.find((n) => n.id === id).url;

/** 관리자 통로·시험 손잡이를 그 서버에 바로 부름 → { status, ok, body } (한 서버만 받게 해 다른 서버로 퍼지는지를 볼 때) */
const internalOn = (node, method, pathname, body) => call(method, pathname, body, { baseUrl: nodeUrl(node) });

/** 판 요약을 판 서버에 바로 물음 (Redis가 멈추면 다른 서버는 판 서버에 못 물어 빈 답이 옴) */
async function gameAt(node, gameId) {
    const r = await internalOn(node, 'GET', `/e2e/games/${encodeURIComponent(gameId)}`);
    return r.ok ? r.body.game : null;
}

/** 지금 단계 넘기기를 판 서버에 바로 시킴 */
async function advanceAt(node, gameId) {
    const r = await internalOn(node, 'POST', `/e2e/games/${encodeURIComponent(gameId)}/advance`, {});
    if (!r.ok) throw new Error(`advance ${node} → ${r.status} ${JSON.stringify(r.body)}`);
    return r.body;
}

/** 그 사람 대기방이 있는 서버 (/e2e/users/:uuid/room의 node), 방이 없으면 null */
async function roomNodeOf(uuid) {
    const r = await call('GET', `/e2e/users/${encodeURIComponent(uuid)}/room`);
    return r.ok ? (r.body?.node ?? null) : null;
}

/** 서버 비우기 끄기 (그 서버에 바로) */
async function undrain(id) {
    const r = await internalOn(id, 'POST', `/internal/nodes/${encodeURIComponent(id)}/drain`, { draining: false });
    if (!r.ok) throw new Error(`비우기 끄기 ${id} → ${r.status} ${JSON.stringify(r.body)}`);
}

/**
 * 서버를 끄거나 비운 시험 뒤 되돌리기 (afterEach): 두 서버 다 켜짐 → 앞단이 다시 그 서버로 보냄 → 비우기 꺼짐
 * 앞단은 붙기 실패한 서버를 5초 뒤로 미룸(scripts/lb-proxy.js) → 그 전에 다음 시험이 시작하면 봇이 엉뚱한 서버에 붙음
 */
async function settleNodes() {
    await servers.waitBackendUp({ timeoutMs: 90_000 });
    for (const id of NODE_IDS) {
        await expect.poll(() => mn.routedServerId(id).catch(() => null), { timeout: 20_000, message: `앞단이 ${id}로 보냄` }).toBe(id);
    }
    for (const id of NODE_IDS) await undrain(id);
}

// ── Redis 멈추기·풀기 (시험 Redis 컨테이너만) ──

// 시험 Redis 컨테이너 이름 (backend/scripts/setup-test-redis.js가 만드는 것, 포트 6380)
const REDIS_CONTAINER = 'mmc-redis-test';
const docker = (args) => execFileSync('docker', args, { stdio: 'ignore', windowsHide: true });

/** Redis 멈춤 (연결은 둔 채 답이 없음) — 다른 시험도 같이 멈추니 @serial 시험에서만, 끝에 꼭 resumeRedis */
function pauseRedis() {
    // E2E_REDIS_URL로 따로 준 Redis는 이 시험이 멈출 수 없음 (건너뛰지 않고 바로 알림)
    if (E2E.redisUrlGiven) throw new Error('Redis 멈추기는 시험 Redis가 docker mmc-redis-test일 때만 됨 (E2E_REDIS_URL을 따로 주면 못 멈춤)');
    docker(['pause', REDIS_CONTAINER]);
}

/** Redis 풀기 (안 멈춰 있으면 아무 일 없음) */
function resumeRedis() {
    try { docker(['unpause', REDIS_CONTAINER]); } catch { /* 안 멈춰 있었음 */ }
}

/** 서버들이 Redis 상태를 그 값(up·down)으로 볼 때까지 (/health의 redis 칸, 멈춤은 5초 안에 down) */
async function waitRedis(state, ids = NODE_IDS, timeout = 20_000) {
    for (const id of ids) {
        await expect.poll(async () => (await mn.nodeHealth(id))?.redis, { timeout, message: `${id} Redis ${state}` }).toBe(state);
    }
}

// ── 관리자 ──

/** 관리자 창 열기 (새 관리자 계정·Access 흉내·OTP 로그인) → { context, page, close } */
async function openAdmin(browser) {
    const context = await browser.newContext({ baseURL: E2E.adminUrl, viewport: { width: 1280, height: 800 }, locale: 'ko-KR', timezoneId: 'Asia/Seoul' });
    const page = await context.newPage();
    await loginAsAdmin(page, await createAdmin());
    return { context, page, close: () => context.close() };
}

/** 로그인한 관리자 창 쿠키로 관리자 API, node를 주면 앞단이 그 서버로 보냄 (?node=) → 답 몸 */
async function adminApi(adminPage, method, pathname, data, { node } = {}) {
    const request = adminPage.context().request;
    const me = await request.get(`${E2E.adminUrl}/admin-api/auth/me`);
    expect(me.ok(), `관리자 로그인 확인 (${me.status()})`).toBe(true);
    const { csrfToken } = await me.json();
    const where = node ? `${pathname.includes('?') ? '&' : '?'}node=${encodeURIComponent(node)}` : '';
    const res = await request.fetch(`${E2E.adminUrl}/admin-api${pathname}${where}`, {
        method, data, headers: { origin: E2E.adminUrl, 'x-admin-csrf': csrfToken },
    });
    expect(res.ok(), `${method} ${pathname} (${res.status()})`).toBe(true);
    return res.json();
}

/** 판 골드 값 바꾸기 (관리자 API) → { settings, nodes, partial } */
const setGold = (adminPage, goldReward, o) => adminApi(adminPage, 'PUT', '/game-settings', { goldReward }, o);

// ── 화면 조각 ──

// 방 만들기·코드 입장 거절 까닭 띠 (PC는 브라우저 알림 창을 닫은 뒤에도 이 띠에 글이 남음)
const entryNotice = (page) => page.getByTestId('entry-failure-notice');

/** 봇이 사람에게 친구 신청 → 사람이 수락 (준비는 API로) */
async function befriendBot(bot, person) {
    await botApi(bot, 'POST', '/friends/requests', { receiverId: U(person) });
    const incoming = await api(person, 'GET', '/friends/requests/incoming');
    const row = incoming.find((r) => r.id === U(bot));
    if (!row) throw new Error('받은 친구 신청 없음');
    await api(person, 'PUT', `/friends/requests/${row.request_id}/accept`);
}

/** 로비 친구 창 "게임 초대" 탭에서 그 사람이 보낸 초대의 "초대 수락" 누름 → 그 초대 줄 (친구 창이 이미 열려 있으면 open: false) */
async function acceptInviteUi(page, fromNickname, { open = true } = {}) {
    if (open) await L.openFriendPanel(page);
    await L.openTab(page, '게임 초대');
    const row = page.getByRole('list', { name: '받은 게임 초대' }).locator('[data-invite-id]').filter({ hasText: fromNickname });
    await row.getByRole('button', { name: '초대 수락' }).click();
    return row;
}

/** 브라우저 알림·확인 창 글 모으기 (뜨면 바로 확인) → 글 배열 (PC 화면) */
function collectDialogs(page) {
    const messages = [];
    page.on('dialog', (dialog) => { messages.push(dialog.message()); dialog.accept().catch(() => {}); });
    return messages;
}

module.exports = {
    mn, test, expect, E2E, NODE_IDS, N1, N2, e2e, internal,
    U, nick, PACE, TEXT, HINT_KEY,
    hintOf, dropHint, lobbyOn, startGame, startHosted, endByJoker, goldChip, rewardedUuids,
    nodeUrl, internalOn, gameAt, advanceAt, roomNodeOf, undrain, settleNodes,
    pauseRedis, resumeRedis, waitRedis, openAdmin, adminApi, setGold,
    entryNotice, befriendBot, acceptInviteUi, collectDialogs,
};
