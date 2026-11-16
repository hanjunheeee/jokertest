'use strict';

// A01a(방 만들기·설정·시작) 브라우저 시험 몫 도우미 — 설정 칸 맞추기(PC·모바일 같이)·서버 방 값 읽기·시작 막힘·점검 켜고 끄기·탈주 줄 넣기
// tests/room/a01-*.spec.js·mobile/a01-*.spec.js·multinode/a01-room-list.spec.js만 씀 (공용 아님, 공용으로 올릴 후보는 보고에 적음)
const crypto = require('node:crypto');
const { expect } = require('@playwright/test');
const { e2e, internal } = require('../../helpers/internal');
const db = require('../../helpers/db');
const ui = require('../../helpers/ui');
const { expectReadable } = require('../../helpers/visible');
const { botsJoinAndReady, blockedDialog } = require('./roomHelpers');

const U = (x) => x.account.uuid;
const nick = (x) => x.account.nickname;
// 방 이름 = "닉네임의 방" (결정 "게임 만들기 누름")
const titleOf = (x) => `${nick(x)}의 방`;

// 서버 거절 글 (목록 A01a 줄 그대로)
const MSG = Object.freeze({
    MIN_PLAYERS: '게임을 시작하기 위한 인원 조건을 아직 충족하지 못했습니다.',
    NOT_READY: '아직 준비하지 않은 참가자가 있습니다.',
    ROLE_MISMATCH: '설정한 역할 구성이 현재 인원과 맞지 않습니다. 인원을 더 모아주세요.',
    UNAVAILABLE: '일부 참가자와의 연결을 확인할 수 없습니다. 잠시 후 다시 시도해주세요.',
    SUM_OVER: '지정한 역할 인원의 합이 최대 플레이어 수를 넘습니다.',
    BELOW_OCCUPANCY: (n) => `현재 인원(${n}명)보다 적은 정원으로는 변경할 수 없습니다.`,
    MAINTENANCE_DEFAULT: '서버 점검 중입니다. 점검이 끝난 뒤 다시 시도해주세요.',
});
// 지운 설정 3칸 이름 (결정 "3칸 삭제")
const REMOVED_LABELS = Object.freeze(['불이 꺼진 무도회', '영혼의 베팅', '투표 공개']);
// 칸 이름 (PC·모바일 같은 글)
const L = Object.freeze({
    MAX: '최대 플레이어 수',
    JOKER: '광대(마피아) 플레이어 수',
    MODE: '역할 구성',
    TALK: '낮 토론 시간 조절',
    VOTE: '낮 투표 시간 조절',
    TRIAL: '재판 시간 조절',
    NIGHT: '밤 행동 시간 조절',
    CODE_ONLY: '코드로만 참가',
});
// 칸마다 끝값과 탭 (결정 "나머지 설정"·"구성 칸")
const EDGES = Object.freeze({
    MAX: { label: L.MAX, tab: '일반', min: 5, max: 10 },
    JOKER: { label: L.JOKER, tab: '일반', min: 1, max: 2 },
    TALK: { label: L.TALK, tab: '회의&투표', min: 30, max: 150 },
    VOTE: { label: L.VOTE, tab: '회의&투표', min: 30, max: 90 },
    TRIAL: { label: L.TRIAL, tab: '회의&투표', min: 15, max: 120 },
    NIGHT: { label: L.NIGHT, tab: '회의&투표', min: 30, max: 120 },
});

// ── 설정 칸 (PC·모바일 둘 다: 화살표 단추의 부모 칸 글이 지금 값) ──

const arrow = (page, label, side) => page.getByRole('button', { name: `${label} ${side}`, exact: true });

/** 칸 지금 글 (예 '60초', '10', '직접 지정') — PC는 화살표 옆 칸, 모바일은 이름 붙은 묶음이라 둘 다 화살표 부모로 읽음 */
async function valueOf(page, label) {
    return (await arrow(page, label, '감소').locator('..').innerText()).trim();
}
const numberOf = async (page, label) => parseInt(await valueOf(page, label), 10);

/** 숫자 칸을 목표 값까지 화살표로 맞춤 */
async function setStep(page, label, target) {
    for (let i = 0; i < 16; i += 1) {
        const now = await numberOf(page, label);
        if (now === target) return;
        await arrow(page, label, now < target ? '증가' : '감소').click();
        await expect.poll(() => numberOf(page, label)).not.toBe(now);
    }
    throw new Error(`${label}을 ${target}로 못 맞춤`);
}

/** 고르기 칸(역할 구성)을 글로 맞춤 */
async function setChoice(page, label, text) {
    for (let i = 0; i < 4; i += 1) {
        if (await valueOf(page, label) === text) return;
        const inc = arrow(page, label, '증가');
        if (await inc.isEnabled()) await inc.click();
        else await arrow(page, label, '감소').click();
    }
    expect(await valueOf(page, label)).toBe(text);
}

/** 체크 칸 켜기·끄기 */
async function setCheck(page, label, on) {
    const box = page.getByRole('checkbox', { name: label, exact: true });
    if ((await box.getAttribute('aria-checked')) !== String(on)) await box.click();
    await expect(box).toHaveAttribute('aria-checked', String(on));
}

/** 탭 고르기 ('일반' | '회의&투표') */
async function selectTab(page, name) {
    await page.getByRole('navigation', { name: '인게임 설정 탭' }).getByRole('button', { name, exact: true }).click();
}

/**
 * 열린 설정 패널 칸 채우기 (만들기·바꾸기 창 둘 다, PC·모바일 둘 다)
 * @param {object} o code·maxPlayers·jokers·custom({JOKER..})·auto(true면 자동으로)·discussion·vote·tribunal·night·roleNights({DOCTOR:60})
 */
async function fill(page, o = {}) {
    await selectTab(page, '일반');
    if (o.code !== undefined) await setCheck(page, L.CODE_ONLY, o.code);
    if (o.maxPlayers !== undefined) await setStep(page, L.MAX, o.maxPlayers);
    if (o.jokers !== undefined && !o.custom) await setStep(page, L.JOKER, o.jokers);
    if (o.auto) await setChoice(page, L.MODE, '자동');
    if (o.custom) {
        await setChoice(page, L.MODE, '직접 지정');
        for (const [role, n] of Object.entries(o.custom)) await setStep(page, `${ui.ROLE_LABELS[role]} 인원`, n);
    }
    const meeting = ['discussion', 'vote', 'tribunal', 'night', 'roleNights'].some((k) => o[k] !== undefined);
    if (!meeting) return;
    await selectTab(page, '회의&투표');
    if (o.discussion !== undefined) await setStep(page, L.TALK, o.discussion);
    if (o.vote !== undefined) await setStep(page, L.VOTE, o.vote);
    if (o.tribunal !== undefined) await setStep(page, L.TRIAL, o.tribunal);
    if (o.night !== undefined) await setStep(page, L.NIGHT, o.night);
    for (const [role, n] of Object.entries(o.roleNights ?? {})) await setStep(page, `${ui.ROLE_LABELS[role]} 밤 시간 조절`, n);
}

/** 칸 끝값에서 화살표가 꺼지는지 (최소로 내리면 −, 최대로 올리면 +) */
async function expectEdges(page, { label, tab, min, max }) {
    await selectTab(page, tab);
    await setStep(page, label, min);
    await expect(arrow(page, label, '감소')).toBeDisabled();
    await expect(arrow(page, label, '증가')).toBeEnabled();
    await setStep(page, label, max);
    await expect(arrow(page, label, '증가')).toBeDisabled();
    await expect(arrow(page, label, '감소')).toBeEnabled();
}

/** 두 탭 어디에도 지운 3칸 글이 없음 (scope = 페이지 또는 창) */
async function expectNoRemovedFields(page, scope = page) {
    for (const tab of ['일반', '회의&투표']) {
        await selectTab(page, tab);
        await expect(scope.getByRole('button', { name: `${L.MAX} 감소` }).or(scope.getByRole('button', { name: `${L.TALK} 감소` }))).toBeVisible();
        for (const gone of REMOVED_LABELS) await expect(scope.getByText(gone)).toHaveCount(0);
    }
}

// ── 방 만들기·대기방 ──

/** 게임 설정 화면 열기 (주소로) */
async function openSetupPage(page) {
    await page.goto('/game-setup');
    await expect(page.getByRole('button', { name: '게임 만들기' })).toBeVisible();
}

/** 서버 방 요약이 생길 때까지 (그 사람 uuid) → { roomId, roomCode, hostUuid, settingsVersion, settings, players } */
async function waitRoom(uuid, match = () => true) {
    let room = null;
    await expect.poll(async () => { room = await e2e.roomOf(uuid); return Boolean(room && match(room)); }, { timeout: 15_000 }).toBe(true);
    return room;
}

/** 화면으로 방 만들기 (PC·모바일 같이) → 대기방 → 서버 방 요약 */
async function createRoomOn(who, o = {}) {
    await openSetupPage(who.page);
    await fill(who.page, o);
    await who.page.getByRole('button', { name: '게임 만들기' }).click();
    await expect(who.page).toHaveURL(/\/game-matching/);
    await expect(who.page.getByRole('button', { name: '게임시작' })).toBeVisible();
    return waitRoom(U(who));
}

/** 대기방 "앉은 수/정원" 숫자 (보이는 쪽 글만, 읽어 주는 글은 따로) */
const capacity = (page) => page.getByTestId('matching-party-capacity').locator('[aria-hidden="true"]');
/** 대기방 머리 방 이름 */
const roomTitle = (page) => page.getByTestId('matching-room-title');

/** 지금 상황(관리자 통로)의 그 방 줄 → { roomId, code, accessType, playerCount, maxPlayers } */
async function liveRoom(roomId) {
    const live = await internal.live();
    return (live.rooms ?? []).find((r) => r.roomId === roomId) ?? null;
}

/** 공개 방 목록(봇이 물음)에서 그 이름 방들 */
async function listedTitled(probe, title) {
    const reply = await probe.request('get_public_rooms', {});
    return (reply?.rooms ?? []).filter((r) => r.title === title);
}

/** 대기방 "초대코드 공유" 창의 방 코드 (PC 6칸 / 모바일 묶음 이름) → { code, cell(보임 확인할 글), close } */
async function openShownCode(page) {
    const open = page.getByRole('button', { name: '초대코드 공유' });
    await expect(open).toBeEnabled({ timeout: 20_000 });
    await open.click();
    const cells = page.getByRole('dialog', { name: '방코드', exact: true }).getByRole('textbox', { name: /방 코드 \d번째 자리/ });
    const group = page.getByRole('group', { name: /^방코드 / });
    await expect(cells.first().or(group)).toBeVisible();
    const close = async () => {
        await page.getByRole('button', { name: '방코드 팝업 닫기' }).click();
        await expect(cells.first().or(group)).toHaveCount(0);
    };
    if (await group.count() > 0) {
        const code = (await group.getAttribute('aria-label')).replace(/^방코드 /, '');
        return { code, cell: group.locator('span').first(), close };
    }
    await expect(cells).toHaveCount(6);
    const code = (await cells.evaluateAll((els) => els.map((el) => el.value))).join('');
    return { code, cell: cells.first(), close };
}

/** 봇 입장만 (준비 안 함) */
async function botsJoin(bots, roomCode) {
    for (const bot of bots) await bot.joinByCode(roomCode);
}

/** 봇 준비 (지금 서버 설정 버전으로 — 설정이 바뀐 뒤에도 씀) */
async function botsReady(bots, hostUuid) {
    const room = await e2e.roomOf(hostUuid);
    for (const bot of bots) {
        const r = await bot.setReady(room.roomId, room.settingsVersion);
        if (!r?.ok) throw new Error(`봇 준비 실패: ${r?.code ?? '답 없음'}`);
    }
    return room;
}

/** 사람 준비 단추 누르고 "준비취소"로 바뀔 때까지 */
async function readyMe(page) {
    await ui.readyUi(page);
    await expect(page.getByRole('button', { name: '준비취소' })).toBeVisible();
}

/**
 * 사람이 방 만들고 봇 들어와 준비 → 사람 준비까지 (시작은 안 누름), PC·모바일 같이
 * @returns {Promise<object>} 서버 방 요약
 */
async function readyRoom(who, botList, settings = {}, { hostReady = true } = {}) {
    const room = await createRoomOn(who, settings);
    if (botList.length > 0) await botsJoinAndReady(botList, U(who), room.roomCode);
    // 새로 생기는 "앉은 수/정원" 숫자에 기대지 않게 서버 명단 수로 기다림
    await expect.poll(async () => (await e2e.roomOf(U(who)))?.players?.length).toBe(1 + botList.length);
    if (hostReady) await readyMe(who.page);
    return room;
}

/**
 * 자동 구성대로 직업 고정 (결정 "구성 칸": 광대 수 + 6명부터 의사·8명부터 경비원·10명부터 마녀사냥꾼) → 사람 시민, 봇은 앞부터 특수 직업
 * @example autoRoles([me], [b1..b4], 1) // { me:'CITIZEN', b1:'JOKER', b2..b4:'CITIZEN' }
 */
function autoRoles(humans, botList, jokers = 1) {
    const n = humans.length + botList.length;
    const special = [...Array(jokers).fill('JOKER'), ...(n >= 6 ? ['DOCTOR'] : []), ...(n >= 8 ? ['GUARD'] : []), ...(n >= 10 ? ['WITCH_HUNTER'] : [])];
    const out = Object.fromEntries(humans.map((h) => [U(h), 'CITIZEN']));
    botList.forEach((b, i) => { out[U(b)] = special[i] ?? 'CITIZEN'; });
    return out;
}

/** 서버가 정한 직업이 예약대로인지 (예약이 가끔 못 맞음) */
async function expectRolesTaken(gameId, presets) {
    const s = await e2e.game(gameId);
    for (const [uuid, role] of Object.entries(presets)) {
        expect(s.players.find((p) => p.uuid === uuid)?.role, `미리 정한 직업 (${uuid})`).toBe(role);
    }
    return s;
}

/** 시작 막힘 창 글이 그 글이고 읽힘 + 대기방 그대로, 판 없음 */
async function expectStartRejected(who, message) {
    const alert = blockedDialog(who.page).getByRole('alert');
    await expect(alert).toHaveText(message);
    await expectReadable(alert);
    await expect(who.page).toHaveURL(/\/game-matching/);
    expect(await e2e.gameOf(U(who)), '판이 생김').toBeNull();
    expect(await e2e.roomOf(U(who)), '대기방이 없어짐').not.toBeNull();
}

/** 시작 막힘 창 "확인"으로 닫기 */
async function closeBlocked(page) {
    await blockedDialog(page).getByRole('button', { name: '확인' }).click();
    await expect(blockedDialog(page)).toHaveCount(0);
}

/** 봇이 받은 판 시작 알림의 방 설정 (game_started.state.roomSettingsSource.settings) */
async function startedSettings(bot) {
    const payload = await bot.waitForEvent('game_started', { timeoutMs: 20_000 });
    return payload?.state?.roomSettingsSource?.settings ?? null;
}

/** 방장 화면 "방 설정 변경" 창 열기 → 창 (PC는 이름 붙은 창, 모바일은 페이지) */
async function openEditor(page) {
    await page.getByRole('button', { name: '방 설정 변경', exact: true }).click();
    await expect(page.getByRole('button', { name: '설정 저장', exact: true })).toBeVisible();
}

/** 창에서 "설정 저장" → 창이 닫힐 때까지 */
async function saveEditor(page) {
    await page.getByRole('button', { name: '설정 저장', exact: true }).click();
    await expect(page.getByRole('button', { name: '설정 저장', exact: true })).toHaveCount(0);
}

/** 방 만들고 "방 삭제하기"로 나가기 → 그 방 코드 (확인 창은 확인) */
async function createAndDelete(who) {
    const room = await createRoomOn(who);
    const page = who.page;
    const accept = (dialog) => { dialog.accept().catch(() => {}); };
    page.on('dialog', accept);
    try {
        await page.getByRole('button', { name: '방 삭제하기' }).click();
        await expect(page).not.toHaveURL(/\/game-matching/, { timeout: 15_000 });
    } finally {
        page.off('dialog', accept);
    }
    await expect.poll(() => e2e.roomOf(U(who))).toBeNull();
    return room.roomCode;
}

/** Tab만 눌러 그 이름 칸에 초점 (못 가면 던짐) */
async function tabTo(page, name, { max = 80 } = {}) {
    for (let i = 0; i < max; i += 1) {
        await page.keyboard.press('Tab');
        const label = await page.evaluate(() => {
            const el = document.activeElement;
            return el?.getAttribute('aria-label') ?? el?.textContent?.trim() ?? '';
        });
        if (label === name) return;
    }
    throw new Error(`Tab으로 "${name}"까지 못 감`);
}

// ── 점검 (서버 전체에 걸려 @serial 시험만) ──

/**
 * 점검 줄 고치고 Node마다 다시 읽기
 * startsInMs: null = 시작 시각 없이 켬(바로 점검 중, 대기방·판을 닫지 않음 — 결정 아침 15번), 0 이하 = 이미 지남(그 순간 대기방·판 닫힘), 양수 = 예고
 * message: null이면 서버 기본 글
 */
async function setMaint({ enabled, startsInMs = null, message = null }) {
    const now = Date.now();
    const startsAt = enabled && startsInMs !== null ? db.sqlTime(now + startsInMs) : null;
    const endsAt = enabled ? db.sqlTime(now + Math.max(startsInMs ?? 0, 0) + 3600e3) : null;
    await db.query(
        'UPDATE maintenance_state SET is_enabled = ?, message = ?, starts_at = ?, ends_at = ?, updated_at = NOW() WHERE id = 1',
        [enabled ? 1 : 0, enabled ? message : null, startsAt, endsAt],
    );
    await internal.reloadMaintenance();
}
/** 점검 끄기 (finally에서 꼭 — 안 끄면 다른 시험 방 만들기가 막힘) */
const clearMaint = () => setMaint({ enabled: false });

/** 점검 큰 안내 창이 뜨면 단추로 닫음 (창이 화면 전체를 덮어 다른 단추를 못 누름) */
async function dismissMaintNotice(page) {
    const box = page.locator('[data-maintenance-notice]');
    await expect(box).toBeVisible({ timeout: 15_000 });
    await box.getByRole('button').first().click();
    await expect(box).toHaveCount(0);
}

// ── 탈주 ──

// 한국 시간 오늘 0시 (ms)
const kstDayStartMs = (now) => Math.floor((now + 9 * 3600e3) / 86400e3) * 86400e3 - 9 * 3600e3;

/** 오늘(한국 시간) 이미 끝난 탈주 줄 n개 넣기 (막힘은 이미 풀린 줄 → 다음 탈주가 n+1번째) */
async function seedTodayDesertions(uuid, n) {
    const now = Date.now();
    const start = kstDayStartMs(now);
    for (let i = 0; i < n; i += 1) {
        const at = Math.max(start + 1000 * (i + 1), now - 120_000 + i * 1000);
        await db.query(
            'INSERT INTO game_desertions (user_id, game_id, reason, deserted_at, blocked_until) VALUES (?, ?, ?, ?, ?)',
            [uuid, crypto.randomUUID(), 'LEFT_ALIVE', new Date(at), new Date(at + 1000)],
        );
    }
}

/** 탈주 글 남은 시간 → 초 ("탈주로 4분 59초 뒤에…" → 299), 모양이 다르면 null */
function waitSecondsOf(text) {
    const m = /^탈주로 (?:(\d+)시간 )?(?:(\d+)분 )?(\d+)초 뒤에 참여할 수 있습니다\.$/.exec(text ?? '');
    if (!m) return null;
    return (Number(m[1] ?? 0) * 3600) + (Number(m[2] ?? 0) * 60) + Number(m[3]);
}

module.exports = {
    U, nick, titleOf, MSG, REMOVED_LABELS, L, EDGES,
    arrow, valueOf, numberOf, setStep, setChoice, setCheck, selectTab, fill, expectEdges, expectNoRemovedFields,
    openSetupPage, waitRoom, createRoomOn, capacity, roomTitle, liveRoom, listedTitled, openShownCode,
    botsJoin, botsReady, readyMe, readyRoom, autoRoles, expectRolesTaken, expectStartRejected, closeBlocked, startedSettings,
    openEditor, saveEditor, createAndDelete, tabTo,
    setMaint, clearMaint, dismissMaintNotice, seedTodayDesertions, waitSecondsOf, kstDayStartMs,
};
