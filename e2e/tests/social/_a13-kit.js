'use strict';

// A13 친구·알림·초대·신고·문의 브라우저 시험 몫 도우미 (친구 창·알림 창·봇 친구·DB 넣기·신고 창·문의 창·빈 곳 찾기)
// social·inquiry·mobile 폴더 a13-*.spec.js가 씀 (이름이 .spec이 아니라 시험으로 안 셈, 공용 아님 — PC·폰 같은 이름표)
const crypto = require('node:crypto');
const { expect } = require('@playwright/test');
const friends = require('../../helpers/friends');
const db = require('../../helpers/db');
const ui = require('../../helpers/ui');
const { sleep } = require('../../helpers/wait');

const U = (x) => x.account?.uuid ?? x.uuid;
// 봇은 nickname, 사람은 account.nickname
const nickOf = (x) => x.nickname ?? x.account.nickname;

// 화면·서버 글 (목록 A13 기대값 그대로)
const TEXT = Object.freeze({
    noResults: '검색 결과가 없습니다.',
    pendingDup: '이미 친구 신청 중입니다.',
    requestRate: '친구 신청이 너무 많습니다. 잠시 후 다시 시도해주세요.',
    sentDone: '신청 완료',
    noBlocks: '차단한 사용자가 없습니다.',
    noIncoming: '받은 친구 요청이 없습니다.',
    online: '접속 중',
    offline: '오프라인',
    requestTitle: '새 친구 요청',
    requestBody: (n) => `${n} 님이 친구 요청을 보냈습니다.`,
    inviteTitle: '게임 초대',
    inviteBody: (n) => `${n} 님이 대기방으로 초대했습니다.`,
    inviteBusy: '지금은 상대를 초대할 수 없습니다.',
    roomFull: '방이 가득 차 초대를 보낼 수 없습니다.',
    inviting: '초대중..',
    welcome: '알림 기능 안내',
    noticeFail: '알림을 불러오지 못했습니다.',
    noticeEmpty: '표시할 알림이 없습니다.',
    deleteRead: '읽은 메시지 삭제',
    reportSent: '신고가 접수되었습니다. 운영자가 확인합니다.',
    reportDup: '이미 이 판에서 신고한 플레이어입니다.',
    reportNeedMemo: '기타 사유는 메모를 적어 주세요.',
    reportMemoLong: '메모는 500자까지 적을 수 있습니다.',
    reportRate: '신고가 너무 많습니다. 잠시 후 다시 시도해주세요.',
    inquiryWaiting: '답 기다림',
    inquiryOpenLimit: '답을 기다리는 문의가 5개예요. 답을 받은 뒤에 써 주세요.',
    replyFrom: '운영팀',
});

// 판 단계 시간 넉넉히 (단계는 손잡이로만 넘어가게, 확인하는 동안 저절로 다음 단계로 안 넘어가게)
const ROOMY = Object.freeze({ dayDiscussionTime: 150, dayVoteTime: 90, tribunalTime: 120, nightActionTime: 120 });

// 환영 안내 출처 키 (계정마다 한 번만 만듦 → 숨긴 줄로 미리 넣어 두면 안 생김)
const WELCOME_KEY = 'system:notifications-available:v1';

// ── 친구 창 (PC 패널·폰 시트 같은 이름표) ──

const PANEL_NAME = /^(친구 목록|친구 신청|친구 수락|게임 초대|차단 목록)$/;
const panel = (page) => page.getByRole('dialog', { name: PANEL_NAME });

/** 로비 "친구 목록" 단추로 친구 창 열기 (이미 열려 있으면 그대로) → 창 */
async function openFriends(page) {
    if (!(await panel(page).isVisible().catch(() => false))) {
        await page.getByRole('button', { name: '친구 목록', exact: true }).click();
    }
    await expect(panel(page)).toBeVisible();
    return panel(page);
}

/** 위쪽 탭 누르기 ("친구 추가"·"요청 수락"·"게임 초대"·"차단 목록" — 초대 탭은 "게임 초대 2"처럼 수가 붙음) */
async function openTab(page, name) {
    await openFriends(page);
    await panel(page).getByRole('tab', { name: new RegExp(`^${name}`) }).click();
}

/** 다른 탭에서 친구 목록(폴더)으로 돌아가기 */
async function showList(page) {
    await openFriends(page);
    const back = panel(page).getByRole('button', { name: '친구 목록으로 돌아가기' });
    if (await back.isVisible().catch(() => false)) await back.click();
    await expect(panel(page)).toHaveAccessibleName('친구 목록');
}

const friendRow = (page, uuid) => panel(page).locator(`li[data-friend-id="${uuid}"]`);
// 폴더 머리 단추 (글 "일반 (1/3)"·"오프라인 (2)"·"즐겨찾기 (1)")
const folderHead = (page, label) => panel(page).getByRole('button', { name: new RegExp(`^${label} \\(`) });
const folderOf = (page, label) => panel(page).locator('section').filter({ has: folderHead(page, label) });

/** 폴더가 접혀 있으면 펼침 (PC는 aria-expanded, 폰 머리는 그 표시가 없어 줄 목록이 있나로 봄) */
async function openFolder(page, label) {
    const head = folderHead(page, label);
    await expect(head).toBeVisible();
    const expanded = await head.getAttribute('aria-expanded');
    if (expanded === 'true') return folderOf(page, label);
    if (expanded === null && await folderOf(page, label).locator('ul').count() > 0) return folderOf(page, label);
    await head.click();
    return folderOf(page, label);
}

/** 친구 추가 탭에서 닉네임 찾기 (엔터 = 폰 키보드 "검색") */
async function search(page, query) {
    await openTab(page, '친구 추가');
    const box = panel(page).getByRole('searchbox', { name: '친구 검색' });
    await box.fill(query);
    await box.press('Enter');
    return box;
}

const candidateRow = (page, uuid) => panel(page).locator(`li[data-candidate-id="${uuid}"]`);
const sendButton = (row, name) => row.getByRole('button', { name: `${name}에게 친구 신청` });
// 받은 신청 줄 (보낸 사람 닉네임으로)
const requestRow = (page, name) => panel(page).locator('li[data-request-id]').filter({ hasText: name });
// 받은 게임 초대 목록·아직 누를 수 있는(수락 단추 있는) 그 사람 초대 줄
const inviteList = (page) => panel(page).getByRole('list', { name: '받은 게임 초대' });
const liveInviteRows = (page, name) => inviteList(page).locator('li').filter({ hasText: name })
    .filter({ has: page.getByRole('button', { name: '초대 수락', exact: true }) });
const blockedList = (page) => panel(page).getByRole('list', { name: '차단한 사용자' });

// ── 봇 친구·신청·초대 (봇 쿠키로 API) ──

/** 사람이 신청 → 봇이 받음 (친구 맺기) */
async function befriendBot(person, bot) {
    await friends.api(person, 'POST', '/friends/requests', { receiverId: U(bot) });
    const incoming = await friends.botApi(bot, 'GET', '/friends/requests/incoming');
    const row = incoming.find((r) => r.id === U(person));
    if (!row) throw new Error('봇이 받은 친구 신청 없음');
    await friends.botApi(bot, 'PUT', `/friends/requests/${row.request_id}/accept`);
}

/** 봇이 사람에게 친구 신청 */
const botRequest = (bot, person) => friends.botApi(bot, 'POST', '/friends/requests', { receiverId: U(person) });

/** 봇이 자기 대기방을 만듦 (정원 기본 6) → { roomId, roomCode, settingsVersion } */
const botRoom = (bot, settings = {}) => bot.createRoom({ maxPlayers: 6, ...settings });

/** 봇이 자기 방에서 사람에게 게임 초대 → 초대 줄 { inviteId, status, … } */
function botInvite(bot, person, room) {
    const key = `${room.roomId}:${U(person)}:${crypto.randomBytes(3).toString('hex')}`;
    return friends.botApi(bot, 'POST', '/friends/invites', { receiverId: U(person), creationKey: key });
}

/** 같은 앞머리를 가진 닉네임 봇 n개 (한 번 검색에 같이 나오게) → { prefix, list } */
async function spawnNamedBots(bots, n) {
    const prefix = `q${crypto.randomBytes(3).toString('hex')}`;
    const list = [];
    for (let i = 0; i < n; i += 1) list.push(...await bots.spawn(1, { account: { nickname: `${prefix}${i}` } }));
    return { prefix, list };
}

// ── DB 확인·넣기 (시험 DB joker_e2e) ──

/** a → b 신청 상태들 (오래된 것부터) → ['DECLINED', 'PENDING'] */
async function requestStatuses(from, to) {
    const rows = await db.query('SELECT status FROM friend_requests WHERE requester_id = ? AND receiver_id = ? ORDER BY id', [U(from), U(to)]);
    return rows.map((r) => r.status);
}

/** 두 사람 사이 기다리는 신청 줄 → [{ requester_id, receiver_id }] */
function pendingBetween(a, b) {
    return db.query(
        "SELECT requester_id, receiver_id FROM friend_requests WHERE status = 'PENDING' AND ((requester_id = ? AND receiver_id = ?) OR (requester_id = ? AND receiver_id = ?))",
        [U(a), U(b), U(b), U(a)],
    );
}

/** 초대 줄 → { status, end_reason } (없으면 null) */
async function inviteRowOf(inviteId) {
    const rows = await db.query('SELECT status, end_reason FROM game_invites WHERE id = ?', [inviteId]);
    return rows[0] ?? null;
}

/** 초대 상태가 바뀔 때까지 기다림 → 줄 */
async function waitInviteStatus(inviteId, status) {
    let row = null;
    await expect.poll(async () => { row = await inviteRowOf(inviteId); return row?.status; }, { message: `초대 상태 ${status}` }).toBe(status);
    return row;
}

/** 알림 줄 넣기 (화면이 목록을 받기 전에 넣어야 보임) → 알림 id */
async function insertNotice(uuid, { type = 'system', title, body, target = null, read = false, sourceKey, at = new Date() } = {}) {
    const id = crypto.randomUUID();
    await db.query(
        'INSERT INTO notifications (id, user_id, type, source_key, title, body, target, created_at, read_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [id, uuid, type, sourceKey ?? `${type}:e2e-${id}`, title ?? `시험 알림 ${id.slice(0, 4)}`, body ?? '시험으로 넣은 알림',
            target === null ? null : JSON.stringify(target), at, read ? at : null],
    );
    return id;
}

/** 환영 안내가 안 생기는 새 계정 (숨긴 안내 줄을 먼저 넣음 — 알림 0개에서 시작하는 시험용) */
async function quietAccount(accounts) {
    const account = await accounts.create();
    await insertNotice(account.uuid, { type: 'hidden', sourceKey: WELCOME_KEY, title: TEXT.welcome, body: '숨긴 안내', read: true });
    return account;
}

/** 그 사람 알림 줄 읽은 시각들 */
async function readTimes(ids) {
    const rows = await db.query(`SELECT id, read_at FROM notifications WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
    return rows.map((r) => r.read_at);
}

/** 그 사람이 받은 알림이 DB에 생길 때까지 (type 종류) → 줄 */
async function waitNoticeRow(uuid, type) {
    let row = null;
    await expect.poll(async () => {
        [row] = await db.query('SELECT id, title, body FROM notifications WHERE user_id = ? AND type = ? ORDER BY created_at DESC LIMIT 1', [uuid, type]);
        return Boolean(row);
    }, { message: `${type} 알림 줄` }).toBe(true);
    return row;
}

// ── 알림 창 (PC 창·폰 시트 같은 이름표) ──

const noticeEntry = (page) => page.locator('[data-notification-entry]');
const noticeDialog = (page) => page.getByRole('dialog', { name: '알림', exact: true });
const noticeRows = (page) => noticeDialog(page).locator('[data-notification-id]');
const noticeRowOf = (page, title) => noticeRows(page).filter({ hasText: title });

async function openNotices(page) {
    await noticeEntry(page).click();
    await expect(noticeDialog(page)).toBeVisible();
    return noticeDialog(page);
}

async function closeNotices(page) {
    await noticeDialog(page).getByRole('button', { name: '닫기', exact: true }).click();
    await expect(noticeDialog(page)).toHaveCount(0);
}

/** 설정 화면 일반 탭의 알림 체크 하나 끄기 ("친구 초대"·"게임 초대"·"시스템 알림") → 로비로 */
async function turnOffNotice(page, label) {
    await page.goto('/setting');
    await ui.skipIntro(page, { timeoutMs: 5000 });
    const box = page.getByRole('checkbox', { name: label, exact: true });
    await expect(box).toBeVisible({ timeout: 15_000 });
    if (await box.getAttribute('aria-checked') === 'true') await box.click();
    await expect(box).toHaveAttribute('aria-checked', 'false');
    await ui.gotoLobby(page);
}

// ── 판·신고 ──

/**
 * 판 차리기 (사람 1 + 봇 n-1): 사람 시민, 맨 뒤 봇 광대 → 역할 창 닫고 첫 낮까지 → 판
 * @param {{ toDay?: boolean, settings?: object }} [o]
 */
async function seatGame(table, user, n, { toDay = true, settings = {} } = {}) {
    const t = await table.setup({
        humans: [user], bots: n - 1, settings: { ...ROOMY, ...settings },
        roles: ({ bots }) => ({ [U(user)]: 'CITIZEN', [U(bots[n - 2])]: 'JOKER' }),
    });
    const s = await t.state();
    expect(s.players, '판 인원').toHaveLength(n);
    expect(s.players.find((p) => p.uuid === U(user))?.role, '사람 직업').toBe('CITIZEN');
    expect(s.players.find((p) => p.uuid === U(t.bots[n - 2]))?.role, '맨 뒤 봇 직업').toBe('JOKER');
    await ui.readRoleReveal(user.page);
    if (toDay) await calmDay(t);
    return t;
}

/** 첫 낮 토론까지 넘기고 사람 화면의 연출 창(낮 안내 등) 닫기 */
async function calmDay(t) {
    await t.advanceUntil('DAY');
    for (const h of t.humans) {
        await h.page.getByRole('dialog', { name: '단계 전환 안내' }).waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
        await ui.closeOverlays(h.page, { keepWatching: true });
    }
}

const recordsSheet = (page) => page.getByRole('dialog', { name: '플레이어별 전적목록', exact: true });
const reportDialog = (page) => page.getByRole('dialog', { name: '플레이어 신고', exact: true });
const reportMessage = (page) => reportDialog(page).getByTestId('report-message');

/** 판 화면 위 "플레이어별 전적목록" 창 열기 (이미 열려 있으면 그대로) → 창 */
async function openRecords(page) {
    const sheet = recordsSheet(page);
    if (!(await sheet.isVisible().catch(() => false))) {
        await expect(async () => {
            await ui.closeOverlays(page, { keepWatching: true });
            await page.getByRole('button', { name: '플레이어별 전적목록', exact: true }).click({ timeout: 2000 });
            await expect(sheet).toBeVisible({ timeout: 2000 });
        }).toPass({ timeout: 20_000 });
    }
    return sheet;
}

/** 전적 목록에서 그 사람 줄 "신고" → 신고 창 */
async function openReport(page, name) {
    const sheet = await openRecords(page);
    await sheet.getByRole('button', { name: `${name} 신고`, exact: true }).click();
    await expect(reportDialog(page)).toBeVisible();
    return reportDialog(page);
}

/** 사유 고르고 "신고하기" */
async function submitReport(page, reason = '욕설') {
    const dialog = reportDialog(page);
    await dialog.getByRole('radio', { name: reason, exact: true }).click();
    await dialog.getByTestId('report-submit').click();
}

/** 신고 창 닫기 (접수 뒤엔 "닫기", 전엔 "취소" — 같은 단추) */
async function closeReport(page) {
    await reportDialog(page).getByTestId('report-cancel').click();
    await expect(reportDialog(page)).toHaveCount(0);
}

/** 이 화면이 보낸 신고 요청 수 세기 (POST /reports) → { n } */
function countReports(page) {
    const box = { n: 0 };
    page.on('request', (r) => {
        if (r.method() === 'POST' && new URL(r.url()).pathname === '/reports') box.n += 1;
    });
    return box;
}

/** API로 신고 하나 (사람 쿠키) */
const apiReport = (person, target, gameId, reasonCode = 'ABUSE') => friends.api(person, 'POST', '/reports', { targetUuid: U(target), gameId, reasonCode });

/** 봇 광대가 나가 판 끝 (산 광대 0 → 시민 승) */
async function jokerQuits(t) {
    const joker = t.bots[t.bots.length - 1];
    const reply = await joker.request('leave_game_session', { gameId: t.gameId });
    expect(reply?.ok, `광대 봇 나가기 답 ${JSON.stringify(reply)}`).toBe(true);
}

// ── 대기방 친구 초대 창 (PC·폰 같은 이름표) ──

const inviteModal = (page) => page.getByRole('dialog', { name: '친구초대', exact: true });

/** 대기방 "친구 초대" 단추로 초대 창 열기 → 창 */
async function openInviteModal(page) {
    if (!(await inviteModal(page).isVisible().catch(() => false))) {
        await page.getByRole('button', { name: '친구 초대', exact: true }).click();
    }
    await expect(inviteModal(page)).toBeVisible();
    return inviteModal(page);
}

/** 초대 창에서 그 친구 "초대하기" */
async function inviteFromModal(page, name) {
    const modal = await openInviteModal(page);
    await modal.getByRole('button', { name: `${name} 게임 초대`, exact: true }).click();
    return modal;
}

// ── 문의 창 (PC 창·폰 시트 같은 표시) ──

/** 로비 메뉴 "고객센터" → 문의 창 */
async function openInquiry(page) {
    await page.getByRole('navigation', { name: '로비 메뉴' }).getByRole('button', { name: '고객센터' }).click();
    await expect(page.getByTestId('inquiry-tab-form')).toBeVisible();
}

/** 문의 쓰기 칸에 적고 보내기 */
async function writeInquiry(page, { category = '버그', title, body = '낮 투표 때 화면이 멈춰요' }) {
    await page.getByTestId('inquiry-tab-form').click();
    await page.getByRole('radio', { name: category, exact: true }).click();
    await page.getByTestId('inquiry-title').fill(title);
    await page.getByTestId('inquiry-body').fill(body);
    await page.getByTestId('inquiry-submit').click();
}

const inquiryRows = (page) => page.locator('[data-testid^="inquiry-row-"]');

/** 답 기다리는 문의 줄 바로 넣기 (2시간 전에 쓴 것으로 — 1분·하루 횟수 제한에 안 걸리게) */
async function insertOpenInquiries(uuid, n) {
    const at = new Date(Date.now() - 2 * 3600 * 1000);
    for (let i = 0; i < n; i += 1) {
        await db.query(
            "INSERT INTO inquiries (user_id, category, title, body, status, created_at, updated_at) VALUES (?, 'BUG', ?, '미리 넣은 문의', 'OPEN', ?, ?)",
            [uuid, `미리 넣은 문의 ${i + 1}`, at, at],
        );
    }
}

// ── 화면 위치 ──

/** 아무 단추·창·메뉴도 없는 빈 곳 한 점 (바깥 누르기용) → { x, y } */
async function emptySpot(page) {
    const spot = await page.evaluate(() => {
        const busy = 'button,a,input,textarea,select,[role="button"],[role="menu"],[role="menuitem"],[role="dialog"],[role="tab"]';
        const w = window.innerWidth;
        const h = window.innerHeight;
        for (let y = Math.floor(h * 0.12); y < h * 0.95; y += 23) {
            for (let x = Math.floor(w * 0.04); x < w * 0.96; x += 29) {
                const el = document.elementFromPoint(x, y);
                if (el && !el.closest(busy)) return { x, y };
            }
        }
        return null;
    });
    if (!spot) throw new Error('빈 곳을 못 찾음');
    return spot;
}

/** Tab을 눌러 그 요소까지 포커스 옮기기 */
async function tabTo(page, locator, max = 120) {
    for (let i = 0; i < max; i += 1) {
        await page.keyboard.press('Tab');
        const here = await locator.evaluate((el) => el === document.activeElement || el.contains(document.activeElement)).catch(() => false);
        if (here) return;
    }
    throw new Error('Tab으로 그 요소에 못 감');
}

/** 끝 시각까지 진짜로 기다림 (진짜 시간 규칙 확인만) */
async function sleepUntil(at) {
    const ms = at - Date.now();
    if (ms > 0) await sleep(ms);
}

module.exports = {
    U, nickOf, TEXT, ROOMY, WELCOME_KEY,
    panel, openFriends, openTab, showList, friendRow, folderHead, folderOf, openFolder, search, candidateRow, sendButton,
    requestRow, inviteList, liveInviteRows, blockedList,
    befriendBot, botRequest, botRoom, botInvite, spawnNamedBots,
    requestStatuses, pendingBetween, inviteRowOf, waitInviteStatus, insertNotice, quietAccount, readTimes, waitNoticeRow,
    noticeEntry, noticeDialog, noticeRows, noticeRowOf, openNotices, closeNotices, turnOffNotice,
    seatGame, calmDay, recordsSheet, reportDialog, reportMessage, openRecords, openReport, submitReport, closeReport, countReports,
    apiReport, jokerQuits,
    inviteModal, openInviteModal, inviteFromModal,
    openInquiry, writeInquiry, inquiryRows, insertOpenInquiries,
    emptySpot, tabTo, sleepUntil,
};
