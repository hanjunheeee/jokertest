'use strict';

// 판 차리기 파일, 봇 방장이 짧은 설정으로 방 만들기 → 사람(브라우저)·봇 입장·준비 → 역할 미리 정하기 → 시작 → 단계 넘기기
// 인게임·결과·모바일 시험이 씀 (fixtures.js의 table 도우미가 만들고 끝나면 봇을 닫음)
const { expect } = require('@playwright/test');
const accounts = require('./accounts');
const { spawnBots, FAST_ROOM_SETTINGS, sleep } = require('./bots');
const { e2e } = require('./internal');
const { joinRoomByCodeUi, readyUi } = require('./ui');

// 서버가 받는 정원 (5~10, backend/validations/room/create.js)
const ALLOWED_MAX_PLAYERS = [5, 6, 7, 8, 9, 10];
// 한 판 최소 인원 (서버가 어느 환경에서나 5명 밑 판은 시작 거절)
const MIN_TABLE_PLAYERS = 5;
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
 * @param {number} [o.bots] 봇 수 (첫 봇이 방장, 최소 1, 사람+봇 합 5~10명) — 안 주면 5명 판이 되게 채움
 * @param {object} [o.settings] 방 설정 덮어쓰기 (기본 FAST_ROOM_SETTINGS: 토론·투표·밤 30초, 재판 15초, 광대 1)
 * @param {Record<string,string>|((ctx:{humans:any[],bots:any[]})=>Record<string,string>)} [o.roles] { uuid: 'JOKER' } 또는 함수
 * @param {boolean} [o.waitIngame=true] 사람 화면이 /ingame 될 때까지
 * @returns {Promise<Table>}
 */
async function setupTable({ humans = [], bots: botCount = Math.max(1, MIN_TABLE_PLAYERS - humans.length), settings = {}, roles = null, waitIngame = true } = {}) {
    if (botCount < 1) throw new Error('봇 방장이 필요함 (bots >= 1) — 사람이 방장인 판은 화면으로 직접 만들기');
    // 5명 밑 판은 서버가 시작을 거절함 → 봇 띄우기 전에 바로 알림 (시작 단계에서 헷갈리는 실패 막기)
    const plannedTotal = humans.length + botCount;
    if (plannedTotal < MIN_TABLE_PLAYERS) {
        throw new Error(`판은 ${MIN_TABLE_PLAYERS}명 이상이어야 함 (지금 사람 ${humans.length} + 봇 ${botCount} = ${plannedTotal}명) — bots를 늘리기`);
    }
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

    /** 끊긴 사람 60초 기다림 바로 끝내기 (탭 닫은 사람 탈락) → { fired: [uuid], after } */
    expireGraces() { return e2e.expireGraces(this.gameId); }

    /** 판 끝 뒤 결과 화면 180초 바로 끝내기 (화면은 로비로, 방장 자리 끝) → { fired, after } — 판이 끝난 뒤에만 */
    closeResults() { return e2e.closeResults(this.gameId); }

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

    /**
     * 봇 표만으로 그 사람을 재판에 세울 수 있나: 낮 투표는 최다 득표가 기권 수보다 많아야 재판 (같거나 적으면 재판 없이 밤)
     * 사람(브라우저)은 안 낸다고 보고 기권으로 셈, 그 사람 자신도 기권
     * @example 5명 판 사람 1·봇 4, 봇 하나를 처형 → { votes: 3, abstain: 2, enough: true } / 사람 2·봇 3 → { votes: 2, abstain: 3, enough: false }
     */
    async botVoteMargin(targetUuid) {
        const s = await this.state();
        const botUuids = new Set(this.bots.map((b) => b.account.uuid));
        const alive = (s?.players ?? []).filter((p) => p.alive && p.isParticipating !== false);
        const votes = alive.filter((p) => botUuids.has(p.uuid) && p.uuid !== targetUuid).length;
        const abstain = alive.length - votes;
        return { votes, abstain, enough: votes > abstain };
    }

    /** 봇 표만으로 재판이 안 되면 바로 던짐 (단계만 계속 넘기다 시간 넘는 것 막기) */
    async assertBotsCanExecute(targetUuid) {
        const m = await this.botVoteMargin(targetUuid);
        if (!m.enough) {
            throw new Error(`봇 표 ${m.votes} ≤ 기권 ${m.abstain} → 재판 없이 밤으로 감 (봇을 늘리거나 사람도 화면으로 투표)`);
        }
        return m;
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
