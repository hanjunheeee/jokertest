'use strict';

// 바 묶음 뒤쪽(바-15~27) 도우미 — e2e table 손잡이 흉내(장면 s로 판 차리기)·이름 정한 봇·폰 판·옛 판 기록 넣기·화면 소켓 글 엿보기
// scenes/ba-2.js만 씀 — 판 굴리기·고르개는 e2e 시험 도우미(_a04-multi·_a09·c-chat·_talk 등)를 그대로 불러 씀
const crypto = require('node:crypto');
const { fromE2e, e2eRequire } = require('../lib/paths');
const { ROOMY, start } = require('../lib/table');

const { expect } = e2eRequire('@playwright/test');
const ui = fromE2e('helpers/ui');
const db = fromE2e('helpers/db');
const { e2e } = fromE2e('helpers/internal');
const { fitMaxPlayers, FAST_ROOM_SETTINGS } = fromE2e('helpers/game');
const A = fromE2e('tests/ingame/_a04-multi');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const U = (x) => x.account?.uuid ?? x.uuid;
const nickOf = (x) => x.nickname ?? x.account.nickname;

/**
 * 앉히기 (lib/table seat과 같음 + 이름 정한 봇): 봇 방장 방 → 봇·사람 입장 → 전원 준비 → 역할 예약
 * 이름 정한 봇은 무작위 봇 뒤에 붙음 (방장은 늘 무작위 첫 봇)
 * @param {{ humans:object[], bots?:number, named?:string[], settings?:object, roles?:object|Function }} o
 */
async function seatWith(s, { humans, bots: botCount = 1, named = [], settings = {}, roles = null }) {
    const bots = await s.spawnBots(botCount);
    for (const nickname of named) bots.push(...await s.spawnBots(1, { nickname }));
    const host = bots[0];
    const total = humans.length + bots.length;
    if (total < 5) throw new Error(`판은 5명 이상 (지금 ${total}명)`);
    const room = await host.createRoom({ ...FAST_ROOM_SETTINGS, ...ROOMY, maxPlayers: fitMaxPlayers(total), ...settings });
    for (const bot of bots.slice(1)) await bot.joinByCode(room.roomCode);
    for (const h of humans) await ui.joinRoomByCodeUi(h.page, room.roomCode);
    for (const bot of bots) await bot.setReady(room.roomId, room.settingsVersion);
    for (const h of humans) await ui.readyUi(h.page);
    const presets = typeof roles === 'function' ? roles({ humans, bots }) : roles;
    if (presets) await e2e.setRoles(presets, { roomId: room.roomId });
    return { room, bots, humans, host };
}

/**
 * e2e 시험의 table 손잡이 흉내 → { setup } (e2e 도우미 A.openTable·startTrial 등에 그대로 넘김)
 * 앉히고 바로 시작, 장면이 닫히면 봇 행동 멈춤
 * @param {{ named?: string[] }} [o] 이름 정한 봇 (닉네임 목록)
 */
function tableOf(s, { named = [] } = {}) {
    return {
        async setup({ humans = [], bots = 4, settings = {}, roles = null } = {}) {
            const t = await start(await seatWith(s, { humans, bots, named, settings, roles }));
            s.keep(() => t.stopBots().catch(() => {}));
            return t;
        },
    };
}

// 가입 규칙 최대 길이(8자) 한글 닉네임 (e2e A04-E-178과 같은 꼴)
function longNickname() {
    const tail = Array.from({ length: 6 }, () => '가나다라마바사아자차카타파하'[Math.floor(Math.random() * 14)]).join('');
    return `맘모${tail}`;
}

/**
 * 폰 판 (사람 1 폰 + 봇): 사람 시민, 첫 봇 광대, 나머지 시민 → 역할 창 닫고 역할 확인 단계 끝 무렵
 * 같은 판을 이어 보는 장면이 같이 씀 → s.state[key]에 두고 있으면 그대로 돌려줌
 * @returns {Promise<{ me:object, t:object, long:object|null }>}
 */
async function phoneTable(s, { key = 'phone', bots = 4, longName = false } = {}) {
    if (s.state[key]) return s.state[key];
    const me = await s.person({ mobile: true, label: '나 (폰, 귀족)' });
    const long = longName ? longNickname() : null;
    const t = await A.openTable(tableOf(s, { named: long ? [long] : [] }), {
        humans: [me],
        bots,
        settings: { jokerCount: 1, roleCompositionMode: 'custom', roleCounts: { JOKER: 1, DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0 } },
        roles: A.plainRoles(),
    });
    const entry = { me, t, long: long ? t.bots.find((b) => b.nickname === long) : null };
    s.state[key] = entry;
    return entry;
}

const deadChoice = (page) => page.getByRole('dialog', { name: '사망 후 선택' });

/**
 * 죽은 내 화면(폰·PC): 낮 시작 영상·글 창을 넘기며 "사망 후 선택"을 기다렸다 "관전 계속하기"
 * (e2e mobile a06-talk-chat keepWatching과 같은 방식)
 */
async function keepWatchingDead(page) {
    await expect(async () => {
        await ui.closeOverlays(page, { keepWatching: false, clickTimeoutMs: 1000 });
        await expect(deadChoice(page)).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 45_000 });
    await expect(async () => {
        await ui.closeOverlays(page, { keepWatching: false, clickTimeoutMs: 1000 });
        if (await deadChoice(page).isVisible()) await deadChoice(page).getByRole('button', { name: '관전 계속하기' }).click({ timeout: 2000 });
        await expect(deadChoice(page)).toBeHidden({ timeout: 1000 });
    }).toPass({ timeout: 45_000 });
}

const roleDialog = (page) => page.getByRole('dialog', { name: '내 역할 보기' });

/**
 * 역할 창은 10초 뒤 저절로 닫힘 → 닫히면 위 줄 "내 역할 보기"로 다시 열어 둠 (ba.js 바-01과 같은 방식, 폰 위 줄에도 같은 이름 단추)
 * 보여 준 뒤 뒤에서 누르는 일이라 s.act로 감쌈
 */
async function keepRoleOpen(s, page) {
    await expect(roleDialog(page)).toBeHidden({ timeout: 30_000 });
    for (let i = 0; i < 5; i += 1) {
        await s.act(() => ui.closeOverlays(page, { names: ['단계 전환 안내'], keepWatching: false }));
        if (!(await roleDialog(page).isVisible().catch(() => false))) {
            await s.act(() => page.getByRole('button', { name: '내 역할 보기', exact: true }).click({ timeout: 3000 }).catch(() => {}));
        }
        await sleep(700);
    }
}

/**
 * 화면 소켓 글 엿보기 (판에 들어가기 전에 걺 — 방 입장 때 새로 열리는 소켓부터 잡힘)
 * → { got: [{ dir:'in'|'out', event, data, at }] }
 */
function watchFrames(page) {
    const box = { got: [] };
    const read = (dir) => ({ payload }) => {
        if (typeof payload !== 'string' || !/^42/.test(payload)) return;
        try {
            const [event, data] = JSON.parse(payload.slice(payload.indexOf('[')));
            box.got.push({ dir, event, data, at: Date.now() });
        } catch { /* 사건 글 아님 */ }
    };
    page.on('websocket', (ws) => {
        ws.on('framereceived', read('in'));
        ws.on('framesent', read('out'));
    });
    return box;
}

// ── 옛 판 기록 넣기 (시험 DB joker_e2e, 업적 셈의 바탕 — e2e _a07-simple-kit seedGames와 같은 꼴 + 낮 표 참여 줄) ──

/**
 * 끝까지 간 운영 판 count개 + 그 판마다 낮 표 참여 votes줄 넣기 (장면이 닫히면 판 줄 지움, 참여 줄은 계정 지울 때 같이 지워짐)
 * @param {{ count:number, votes?:number, deserted?:boolean }} o deserted면 그 사람 판 줄 죽은 이유 DISCONNECT(산 채로 나감)
 */
async function seedGames(s, uuid, { count, votes = 0, deserted = false }) {
    await db.assertTestDb();
    const ids = [];
    s.keep(async () => {
        for (const id of ids) {
            await db.query('DELETE FROM vote_participations WHERE game_id = ?', [id]).catch(() => {});
            await db.query('DELETE FROM game_result_players WHERE game_id = ?', [id]).catch(() => {});
            await db.query('DELETE FROM game_results WHERE id = ?', [id]).catch(() => {});
        }
    });
    for (let i = 0; i < count; i += 1) {
        const id = crypto.randomUUID();
        const at = db.sqlTime(Date.UTC(2026, 8, 1, 0, i));
        await db.query(
            'INSERT INTO game_results (id, started_at, ended_at, winner, win_reason, day_index, player_count, settings, completed) VALUES (?,?,?,?,?,?,?,?,?)',
            [id, at, at, 'NONE', null, Math.max(2, votes), 5, JSON.stringify({ gameSource: { v: 1, value: 'production' } }), 1],
        );
        ids.push(id);
        await db.query(
            'INSERT INTO game_result_players (game_id, user_id, nickname_snapshot, role, team, won, is_alive, death_reason) VALUES (?,?,?,?,?,?,?,?)',
            [id, uuid, '옛판', 'CITIZEN', 'CITIZEN', 0, 0, deserted ? 'DISCONNECT' : null],
        );
        for (let d = 1; d <= votes; d += 1) {
            await db.query('INSERT INTO vote_participations (game_id, day_index, user_id, accepted_at) VALUES (?,?,?,?)', [id, d, uuid, at]);
        }
    }
    return ids;
}

/** 이미 받은 업적으로 적어 둠 (보려는 업적 하나만 새로 받게) */
async function markGranted(uuid, achievementIds) {
    for (const achievementId of achievementIds) {
        await db.query('INSERT INTO achievement_grants (user_id, achievement_id, granted_at) VALUES (?,?,?)', [uuid, achievementId, db.sqlTime()]);
    }
}

/** 판 기록이 DB에 끝까지 간 판으로 남을 때까지 (판 끝 저장) */
async function waitSaved(gameId, { timeout = 30_000 } = {}) {
    await expect.poll(async () => {
        const rows = await db.query('SELECT completed FROM game_results WHERE id = ?', [gameId]);
        return Number(rows[0]?.completed ?? -1);
    }, { timeout, message: '판 기록 저장' }).toBe(1);
}

module.exports = {
    sleep, U, nickOf, seatWith, tableOf, longNickname, phoneTable, deadChoice, keepWatchingDead, roleDialog, keepRoleOpen,
    watchFrames, seedGames, markGranted, waitSaved,
};
