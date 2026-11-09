'use strict';

// 밤 시험 판 차리기 파일, 역할 맞춘 판 차리기·봇 틈 주며 단계 넘기기·서버 판 요약과 봇 사건 읽기
// _night/index.js가 다시 내보냄 (b-night 시험은 require('./_night')로 씀)
const { expect } = require('@playwright/test');
const { openPerson } = require('../../../../helpers/fixtures');
const { customRoleSettings } = require('../../../../helpers/game');
const { sleep } = require('../../../../helpers/wait');

/**
 * 직접 구성 방 설정: custom({ JOKER: 1, DOCTOR: 1 }) → 광대 수 맞춘 settings (helpers/game.js customRoleSettings)
 * @param {{JOKER?:number,DOCTOR?:number,GUARD?:number,WITCH_HUNTER?:number}} counts
 */
const custom = customRoleSettings;

/**
 * 역할 고정 함수: 사람들 역할 + 봇 순서대로 역할 (null이면 안 정함)
 * @param {string[]} humanRoles 사람 순서대로
 * @param {(string|null)[]} botRoles 봇 순서대로
 */
function roles(humanRoles, botRoles = []) {
    return ({ humans, bots }) => {
        const out = {};
        humanRoles.forEach((role, i) => { if (role && humans[i]) out[humans[i].account.uuid] = role; });
        botRoles.forEach((role, i) => { if (role && bots[i]) out[bots[i].account.uuid] = role; });
        return out;
    };
}

// 단계를 넘기기 전에 봇이 낼 틈 (투표·재판·밤 차례는 봇이 400ms마다 스냅샷을 보고 내서, 바로 넘기면 못 낸 채 마감됨)
function settleMsFor(s) {
    if (s.phase === 'TRIBUNAL') return 1300;
    if (s.phase === 'DAY' && s.dayPhase === 'DAY_VOTE') return 1300;
    if (s.phase === 'NIGHT' && s.nightTurnRole) return 1100;
    return 250;
}

/**
 * 조건 될 때까지 단계 넘기기 (봇 행동 틈을 단계마다 줌), t.advanceUntil 대신 씀
 * @param {*} t 판
 * @param {(s:any)=>boolean} match
 */
async function advanceUntilSettled(t, match, { stepDelayMs = 400, maxSteps = 60, allowEnd = false } = {}) {
    for (let i = 0; i < maxSteps; i += 1) {
        const s = await t.state();
        if (!s) return null;
        if (match(s)) return s;
        if (s.phase === 'ENDED') {
            if (allowEnd) return s;
            throw new Error(`판이 먼저 끝남 (winner=${s.winResult?.winner})`);
        }
        await sleep(settleMsFor(s));
        const again = await t.state();
        if (!again) return null;
        if (match(again)) return again;
        // 틈 사이에 단계가 바뀌었으면 다시 봄 (바뀐 단계 마감을 바로 돌리지 않게)
        if (again.phase !== s.phase || again.dayIndex !== s.dayIndex || again.dayPhase !== s.dayPhase || again.nightTurnRole !== s.nightTurnRole) continue;
        await t.advance();
        await sleep(stepDelayMs);
    }
    throw new Error('단계 못 맞춤');
}

/** 사람 하나를 새 계정·새 브라우저 창으로 바꿔 끼움 (시험 코드가 같은 객체를 계속 쓰게 속만 바꿈) */
async function renewHuman(h) {
    const old = h.page.context();
    const fresh = await openPerson(old.browser());
    h.account = fresh.account;
    h.page = fresh.page;
    h.context = fresh.context;
    // 옛 창은 닫음 (옛 판은 남은 봇과 함께 시험 끝에 정리됨)
    await old.close().catch(() => {});
}

/**
 * 판 차리기 + 역할 맞추기: table.setup 뒤 서버 역할을 읽어 사람 역할이 바라는 대로인지 확인하고,
 * 봇 배열(t.bots)을 역할 바람(botRoles) 순서에 맞게 다시 줄 세움
 * (시험 손잡이의 역할 미리 정하기는 서로 바꿔 끼우는 방식이라 여럿 정하면 가끔 봇 몇이 못 맞음 → 봇은 순서를 바꿔 맞춤, 자리 순서는 그대로)
 * @param {*} table fixtures의 table
 * @param {{humans:any[], bots:number, settings?:object, humanRoles?:string[], botRoles?:(string|null)[]}} o
 */
async function setup(table, { humans, bots, settings = {}, humanRoles = [], botRoles = [] }) {
    let t = null;
    let s = null;
    for (let attempt = 1; ; attempt += 1) {
        t = await table.setup({ humans, bots, settings, roles: roles(humanRoles, botRoles) });
        s = await t.state();
        const wrong = humanRoles.some((role, i) => role && s.players.find((p) => p.uuid === humans[i].account.uuid)?.role !== role);
        if (!wrong) break;
        // 미리 정한 역할은 서버 전체가 같이 쓰는 표라 다른 시험의 지우기와 겹치면 사라짐 → 사람을 새 계정·새 창으로 바꿔 새 판 (3번까지)
        if (attempt >= 3) throw new Error('사람 역할을 3번 다 못 맞춤');
        console.warn(`[e2e] 사람 역할 못 맞춤 → 새 사람으로 다시 (${attempt})`);
        await t.stopBots().catch(() => {});
        for (const h of humans) await renewHuman(h);
    }
    const roleOf = (uuid) => s.players.find((p) => p.uuid === uuid)?.role;
    const pool = [...t.bots];
    const ordered = new Array(t.bots.length).fill(null);
    // 원래 자리 봇이 이미 맞으면 그대로 둠
    botRoles.forEach((role, i) => {
        if (role && roleOf(t.bots[i].account.uuid) === role) {
            ordered[i] = t.bots[i];
            pool.splice(pool.indexOf(t.bots[i]), 1);
        }
    });
    // 못 맞은 자리는 남은 봇 중 그 역할 (자리 순서 앞부터)
    botRoles.forEach((role, i) => {
        if (!role || ordered[i]) return;
        const k = pool.findIndex((b) => roleOf(b.account.uuid) === role);
        if (k < 0) throw new Error(`봇 ${i} 역할 ${role} 자리가 모자람 (구성 확인)`);
        ordered[i] = pool.splice(k, 1)[0];
    });
    for (let i = 0; i < ordered.length; i += 1) if (ordered[i] === null) ordered[i] = pool.shift();
    if (ordered.some((b, i) => b !== t.bots[i])) console.warn('[e2e] 봇 역할 순서 다시 맞춤');
    t.bots = ordered;
    return t;
}

/** 밤 그 역할 차례까지 넘기기 (dayIndex 주면 그 밤) */
function toTurn(t, role, { dayIndex = null, stepDelayMs = 400, maxSteps = 60 } = {}) {
    return advanceUntilSettled(
        t,
        (s) => s.phase === 'NIGHT' && s.nightTurnRole === role && (dayIndex === null || s.dayIndex === dayIndex),
        { stepDelayMs, maxSteps },
    );
}

/** 밤 들어갈 때까지 (dayIndex 주면 그 밤) */
function toNight(t, { dayIndex = null, stepDelayMs = 400 } = {}) {
    return advanceUntilSettled(t, (s) => s.phase === 'NIGHT' && (dayIndex === null || s.dayIndex === dayIndex), { stepDelayMs });
}

/** 낮 들어갈 때까지 (dayIndex 주면 그 낮) */
function toDay(t, { dayIndex = null, stepDelayMs = 400 } = {}) {
    return advanceUntilSettled(t, (s) => s.phase === 'DAY' && (dayIndex === null || s.dayIndex === dayIndex), { stepDelayMs });
}

/** 판 끝날 때까지 → 끝난 판 요약 */
function toEnd(t, { stepDelayMs = 400, maxSteps = 90 } = {}) {
    return advanceUntilSettled(t, (s) => s.phase === 'ENDED', { stepDelayMs, maxSteps, allowEnd: true });
}

/** 봇이 받은 밤 차례 시작 순서 (그 밤만) */
function turnOrder(bot, dayIndex) {
    return bot.events
        .filter((r) => r.event === 'night_turn_started' && r.payload?.dayIndex === dayIndex)
        .map((r) => r.payload.role);
}

/** 봇이 받은 사건 payload 목록 */
function eventsOf(bot, event) {
    return bot.events.filter((r) => r.event === event).map((r) => r.payload);
}

/** 서버 기준 그 사람이 죽었는지까지 */
async function waitDead(t, uuid) {
    await expect.poll(async () => (await t.player(uuid))?.alive, { timeout: 15000 }).toBe(false);
}

/** 판 요약에서 사람 줄 */
const rowOf = (s, uuid) => s.players.find((p) => p.uuid === uuid);
const aliveCount = (s) => s.players.filter((p) => p.alive).length;

/** 봇 하나로 밤 행동 직접 보내기 → 서버 답 { ok, code } */
function botNight(t, bot, targetId) {
    return bot.request('submit_night_action', { gameId: t.gameId, targetId });
}

/** 판 끝까지 단계 넘기기 → 마지막 요약 */
async function advanceToEnd(t, { stepDelayMs = 450, maxSteps = 80 } = {}) {
    for (let i = 0; i < maxSteps; i += 1) {
        const s = await t.state();
        if (!s) return null;
        if (s.phase === 'ENDED') return s;
        await t.advance();
        await sleep(stepDelayMs);
    }
    throw new Error('판이 안 끝남');
}

/** 봇 스냅샷의 공개 승패 (끝난 판, mvp·reveals 포함) */
async function publicWinResult(t, botIndex = 0) {
    const snap = await t.bots[botIndex].snapshot(t.gameId);
    return snap?.winResult ?? null;
}

module.exports = {
    custom, roles, setup, advanceUntilSettled, toTurn, toNight, toDay, toEnd, advanceToEnd,
    turnOrder, eventsOf, waitDead, rowOf, aliveCount, botNight, publicWinResult,
};
