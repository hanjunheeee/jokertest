'use strict';

// 판 차리기 파일, 봇 방장이 짧은 설정으로 방 만들기 → 사람(브라우저)·봇 입장·준비 → 역할 미리 정하기 → 시작 → 단계 넘기기
// 인게임·결과·모바일 시험이 씀 (fixtures.js의 table 도우미가 만들고 끝나면 봇을 닫음)
const { expect } = require('@playwright/test');
const accounts = require('./accounts');
const { spawnBots, FAST_ROOM_SETTINGS, sleep } = require('./bots');
const { e2e } = require('./internal');
const { joinRoomByCodeUi, readyUi } = require('./ui');

// 서버가 받는 정원 (개발 최소 4, backend/validations/room/create.js)
const ALLOWED_MAX_PLAYERS = [4, 5, 6, 7, 8, 9, 10];
const fitMaxPlayers = (total) => ALLOWED_MAX_PLAYERS.find((n) => n >= total) ?? 10;

/**
 * 역할 직접 구성 방 설정 (작은 판에서도 의사·경비원·마녀사냥꾼 넣기), 광대 수는 jokerCount와 같아야 서버가 받음
 * @example customRoleSettings({ JOKER: 1, DOCTOR: 1 }) // { jokerCount: 1, roleCompositionMode: 'custom', roleCounts: { JOKER: 1, DOCTOR: 1, GUARD: 0, WITCH_HUNTER: 0 } }
 * @param {{JOKER?:number,DOCTOR?:number,GUARD?:number,WITCH_HUNTER?:number}} [counts]
 * @param {object} [extra] 같이 덮어쓸 방 설정 (예: { nightActionTime: 60 })
 */
function customRoleSettings(counts, extra = {}) {
    const roleCounts = { JOKER: 1, DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0, ...counts };
    return { jokerCount: roleCounts.JOKER, roleCompositionMode: 'custom', roleCounts, ...extra };
}

/**
 * 판 하나 차리기
 * @param {object} o
 * @param {{ page: import('@playwright/test').Page, account: {uuid:string} }[]} [o.humans] 브라우저 사람 (로그인된 page)
 * @param {number} [o.bots=1] 봇 수 (첫 봇이 방장, 최소 1)
 * @param {object} [o.settings] 방 설정 덮어쓰기 (기본 FAST_ROOM_SETTINGS: 토론·투표·밤 30초, 재판 15초, 광대 1)
 * @param {Record<string,string>|((ctx:{humans:any[],bots:any[]})=>Record<string,string>)} [o.roles] { uuid: 'JOKER' } 또는 함수
 * @param {boolean} [o.waitIngame=true] 사람 화면이 /ingame 될 때까지
 * @returns {Promise<Table>}
 */
async function setupTable({ humans = [], bots: botCount = 1, settings = {}, roles = null, waitIngame = true } = {}) {
    if (botCount < 1) throw new Error('봇 방장이 필요함 (bots >= 1) — 사람이 방장인 판은 화면으로 직접 만들기');
    const botAccounts = await accounts.createAccounts(botCount, {});
    const bots = await spawnBots(botAccounts);
    const host = bots[0];
    const total = humans.length + bots.length;
    const room = await host.createRoom({ ...FAST_ROOM_SETTINGS, maxPlayers: fitMaxPlayers(total), ...settings });

    // 봇 입장 → 사람 입장 (사람은 화면으로)
    for (const bot of bots.slice(1)) await bot.joinByCode(room.roomCode);
    for (const human of humans) await joinRoomByCodeUi(human.page, room.roomCode);

    // 준비: 봇은 소켓으로, 사람은 화면 버튼
    for (const bot of bots) await bot.setReady(room.roomId, room.settingsVersion);
    for (const human of humans) await readyUi(human.page);

    const table = new Table({ room, bots, humans });
    const presets = typeof roles === 'function' ? roles({ humans, bots }) : roles;
    // 이 방 예약 (병렬로 도는 다른 판과 안 섞임)
    if (presets && Object.keys(presets).length > 0) await e2e.setRoles(presets, { roomId: room.roomId });

    const started = await host.startGame(room.roomId, room.settingsVersion);
    table.gameId = started.gameId;
    if (waitIngame) {
        for (const human of humans) await expect(human.page).toHaveURL(/\/ingame/, { timeout: 20000 });
    }
    return table;
}

class Table {
    constructor({ room, bots, humans }) {
        this.room = room;
        this.roomCode = room.roomCode;
        this.bots = bots;
        this.humans = humans;
        this.gameId = null;
        this.plays = [];
    }

    /** 판 요약 (역할·생존·단계) — 서버 기준 */
    state() { return e2e.game(this.gameId); }

    /** 지금 단계 바로 끝내기 → { fired, before, after } */
    advance() { return e2e.advance(this.gameId); }

    /**
     * 조건 될 때까지 단계 넘기기
     * @param {string|((s:any)=>boolean)} target 단계 이름('DAY'·'NIGHT'·'TRIBUNAL'·'ENDED') 또는 판 요약을 받는 함수
     * @param {object} [o]
     * @param {number} [o.stepDelayMs=400] 넘긴 뒤 화면·봇이 따라오게 잠깐 쉼
     * @param {number} [o.maxSteps=40]
     */
    async advanceUntil(target, { stepDelayMs = 400, maxSteps = 40 } = {}) {
        const match = typeof target === 'function' ? target : (s) => s.phase === target || (target === 'DAY_VOTE' && s.dayPhase === 'DAY_VOTE');
        for (let i = 0; i < maxSteps; i += 1) {
            const s = await this.state();
            if (!s) return null; // 판이 장부에서 빠짐 (끝난 뒤 정리)
            if (match(s)) return s;
            if (s.phase === 'ENDED') throw new Error(`판이 먼저 끝남 (기다린 것: ${target})`);
            await this.advance();
            await sleep(stepDelayMs);
        }
        throw new Error(`단계 못 맞춤: ${target}`);
    }

    /** 판 요약에서 uuid로 사람 찾기 */
    async player(uuid) { return (await this.state())?.players.find((p) => p.uuid === uuid) ?? null; }

    /**
     * 봇들 행동 시작 (뒤에서 돎) — plan은 bots.js E2eBot.play 설명 참고
     * @param {object|((bot:any, index:number)=>object)} plan 모든 봇에 같은 계획 또는 봇마다
     */
    playBots(plan = {}) {
        this.plays = this.bots.map((bot, i) => bot.play(this.gameId, typeof plan === 'function' ? plan(bot, i) : plan));
        return this.plays;
    }

    async stopBots() { await Promise.all(this.plays.map((p) => p.stop())); this.plays = []; }

    /** 봇 닫기 (fixtures가 시험 끝에 부름) */
    async close() {
        await this.stopBots().catch(() => {});
        await Promise.all(this.bots.map((b) => b.close().catch(() => {})));
    }
}

module.exports = { setupTable, Table, fitMaxPlayers, customRoleSettings, FAST_ROOM_SETTINGS };
