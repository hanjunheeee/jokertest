'use strict';

// 자동 플레이어(소켓 봇) 파일, 부하 시험 봇(backend/scripts/loadtest/bot.js)을 이어받아 방 만들기·입장·준비·시작 + 행동 지정해서 판 돌리기
// 판 시험이 빈자리 채우기·특정 사람 처형/살해·죽은 사람 채팅 만들기에 씀 (fixtures.js의 bots 도우미가 만들고 끝나면 닫음)
const path = require('node:path');
const { BACKEND_DIR, E2E } = require('./env');
const { Bot } = require(path.join(BACKEND_DIR, 'scripts', 'loadtest', 'bot'));
const { Stats } = require(path.join(BACKEND_DIR, 'scripts', 'loadtest', 'stats'));
// sleep은 예전처럼 여기서도 내보냄 (tests/ingame 도우미가 bots에서 꺼내 씀)
const { sleep } = require('./wait');

const pick = (list) => list[Math.floor(Math.random() * list.length)];

// 판 빨리 돌리는 방 설정 (서버가 받는 가장 짧은 값: 토론·투표·밤 30초, 재판 15초), 필요한 칸만 덮어 씀
// 역할 수는 roleCounts로 (예: { DOCTOR: 1, GUARD: 0 }) — 규칙은 backend/validations/room/create.js
const FAST_ROOM_SETTINGS = Object.freeze({
    accessType: 'code',
    maxPlayers: 5,
    jokerCount: 1,
    lightsOut: false,
    soulBetting: false,
    voteReveal: false,
    dayDiscussionTime: 30,
    dayVoteTime: 30,
    tribunalTime: 15,
    nightActionTime: 30,
});

class E2eBot extends Bot {
    constructor({ account, index }) {
        super({ origin: E2E.apiUrl, account, index, stats: new Stats(), timeoutMs: 15000, originHeader: E2E.desktopUrl });
        /** 받은 사건 전부 [{ event, payload, at }] (시험이 확인용으로 봄) */
        this.events = [];
        this.listeners = new Set();
        this.nickname = account.nickname;
    }

    // 로그인 500 (새 계정 동시 첫 로그인 DB 교착, README '알려진 문제') 이면 조금 쉬고 다시 — 로그인 자체를 시험하는 곳은 이걸 안 씀
    async login() {
        for (let attempt = 1; ; attempt += 1) {
            try {
                return await super.login();
            } catch (error) {
                if (attempt >= 4 || !/로그인 5[0-9][0-9]/.test(error.message)) throw error;
                console.warn(`[e2e] 봇${this.index} 로그인 ${error.message} → 다시 (${attempt})`);
                await sleep(150 * attempt + Math.random() * 200);
            }
        }
    }

    async connect() {
        await super.connect();
        this.socket.onAny((event, payload) => {
            const row = { event, payload, at: Date.now() };
            this.events.push(row);
            for (const listener of this.listeners) listener(row);
        });
    }

    /** 사건 하나 기다림 (이미 온 것도 봄, match로 고름) → payload, 시간 넘으면 던짐 */
    waitForEvent(event, { match = () => true, timeoutMs = 20000, since = 0 } = {}) {
        const hit = this.events.find((r) => r.event === event && r.at >= since && match(r.payload));
        if (hit) return Promise.resolve(hit.payload);
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => { this.listeners.delete(listener); reject(new Error(`봇${this.index} 사건 안 옴: ${event}`)); }, timeoutMs);
            const listener = (row) => {
                if (row.event !== event || !match(row.payload)) return;
                clearTimeout(timer);
                this.listeners.delete(listener);
                resolve(row.payload);
            };
            this.listeners.add(listener);
        });
    }

    /** 방 만들기 → { roomId, roomCode, settingsVersion } */
    async createRoom(settings = {}) {
        const reply = await this.request('create_room', { ...FAST_ROOM_SETTINGS, ...settings });
        if (!reply?.ok) throw new Error(`봇 방 만들기 실패: ${reply?.code ?? '응답 없음'} ${reply?.message ?? ''}`);
        return reply.room;
    }

    /** 코드로 입장 → room_joined payload */
    // 서버 2개면 첫 답이 ROOM_ON_OTHER_NODE(방 있는 Node로 옮겨 다시)일 수 있음 → 부모 봇이 옮긴 뒤 다시 보내고 그 답은 안 넘김
    // 그래서 events(onAny, 걸러지기 전 답)가 아니라 부모가 걸러 넘기는 waiters로 끝 답만 받음
    async joinByCode(roomCode, { timeoutMs = 20000 } = {}) {
        const answer = new Promise((resolve) => {
            const handlers = new Map();
            const finish = (kind, payload) => {
                clearTimeout(timer);
                // 내가 건 것만 지움 (다음 입장이 건 것을 지우지 않게)
                for (const [event, fn] of handlers) if (this.waiters.get(event) === fn) this.waiters.delete(event);
                resolve({ kind, payload });
            };
            handlers.set('room_joined', (p) => finish('joined', p));
            handlers.set('room_join_failed', (p) => finish('failed', p));
            const timer = setTimeout(() => finish('timeout', null), timeoutMs);
            for (const [event, fn] of handlers) this.waiters.set(event, fn);
        });
        this.emit('join_room_by_code', { roomCode });
        const { kind, payload } = await answer;
        if (kind === 'joined') return payload;
        if (kind === 'failed') throw new Error(`봇${this.index} 입장 실패: ${JSON.stringify(payload)}`);
        throw new Error(`봇${this.index} 사건 안 옴: room_joined`);
    }

    async setReady(roomId, settingsVersion, isReady = true) {
        return this.request('set_ready', { isReady, roomId, expectedSettingsVersion: settingsVersion });
    }

    /** 방장 봇: 시작될 때까지 몇 번 다시 (다른 사람 준비가 늦게 퍼질 수 있음) → { gameId } */
    async startGame(roomId, settingsVersion, { tries = 40, delayMs = 500 } = {}) {
        let last = null;
        for (let i = 0; i < tries; i += 1) {
            last = await this.request('start_game', { roomId, expectedSettingsVersion: settingsVersion });
            if (last?.ok) return last;
            await sleep(delayMs);
        }
        throw new Error(`봇 시작 실패: ${last?.code ?? '응답 없음'}`);
    }

    async snapshot(gameId) {
        const reply = await this.request('get_session_snapshot', { gameId });
        return reply?.ok ? reply : null;
    }

    /**
     * 행동 지정해서 판 끝(또는 stop())까지 돌기 — 기다리지 않고 바로 돌려줌, .done이 끝 결과 Promise
     * 대상 값: 'random' | 'skip' | 'abstain'(낮 투표만) | uuid | 닉네임 | (ctx) => uuid|null
     * @param {string} gameId
     * @param {object} [plan]
     * @param {string|null|Function} [plan.dayChat]   낮 토론에 할 말 (null이면 안 함)
     * @param {boolean} [plan.readyForVote=true]      낮 토론에서 '투표 준비' 누르기
     * @param {*} [plan.dayVote='random']             낮 투표 대상
     * @param {'GUILTY'|'NOT_GUILTY'|'skip'|Function} [plan.tribunal='GUILTY']  재판 표 (skip = 안 냄 → 마감 때 기권)
     * @param {*} [plan.night='random']               내 밤 차례 대상 (광대는 동료 빼고)
     * @param {string|null} [plan.jokerChat]          광대 밤 채팅
     * @param {string|null} [plan.deadChat]           죽은 뒤 한 번 할 말 (낮·밤 다 죽은 사람 채팅으로 감)
     * @param {number} [plan.pollMs=400]
     */
    play(gameId, plan = {}) {
        const p = { readyForVote: true, dayVote: 'random', tribunal: 'GUILTY', night: 'random', pollMs: 400, ...plan };
        this.playing = true;
        const done = new Set();
        let saidDead = false;
        const run = async () => {
            while (this.playing && !this.closing) {
                const s = await this.snapshot(gameId);
                if (!s) {
                    const reply = this.lastReply;
                    if (reply && ['FORFEITED_FROM_SESSION', 'NOT_A_PARTICIPANT', 'GAME_ID_MISMATCH'].includes(reply.code)) return 'LOST';
                    await sleep(p.pollMs);
                    continue;
                }
                if (s.phase === 'ENDED') return 'ENDED';
                await this.actOnce(gameId, s, done, p, () => saidDead, () => { saidDead = true; });
                await sleep(p.pollMs);
            }
            return 'STOPPED';
        };
        const promise = run();
        return { done: promise, stop: () => { this.playing = false; return promise; } };
    }

    async request(event, payload) {
        const reply = await super.request(event, payload);
        this.lastReply = reply;
        return reply;
    }

    resolveTarget(choice, ctx, candidates) {
        if (choice === 'skip' || choice === null || choice === undefined) return undefined;
        if (choice === 'abstain') return null;
        if (typeof choice === 'function') return choice(ctx);
        if (choice === 'random') return candidates.length > 0 ? pick(candidates).uuid : undefined;
        const found = ctx.players.find((pl) => pl.uuid === choice || pl.nickname === choice);
        return found?.uuid;
    }

    async actOnce(gameId, s, done, p, saidDead, markSaidDead) {
        const me = s.self;
        if (!me) return;
        const meRow = s.players?.find((pl) => pl.uuid === me.uuid);
        if (meRow && meRow.isAlive === false) {
            if (p.deadChat && !saidDead()) {
                markSaidDead();
                await this.request('submit_game_chat_message', { gameId, text: p.deadChat });
            }
            return;
        }
        const allies = new Set(me.allies ?? []);
        const others = (s.players ?? []).filter((pl) => pl.isAlive && pl.isParticipating && pl.uuid !== me.uuid);
        const ctx = { snapshot: s, me, players: s.players ?? [], others, allies, bot: this };
        const key = [s.phase, s.dayIndex, s.dayPhase ?? '', s.nightTurnRole ?? '', s.tribunal?.defendantUuid ?? ''].join(':');
        if (done.has(key)) return;
        done.add(key);

        if (s.phase === 'DAY' && s.dayPhase === 'DAY_DISCUSSION') {
            const text = typeof p.dayChat === 'function' ? p.dayChat(ctx) : p.dayChat;
            if (text) await this.request('submit_game_chat_message', { gameId, text });
            if (p.readyForVote) await this.request('ready_for_day_vote', { gameId });
        } else if (s.phase === 'DAY' && s.dayPhase === 'DAY_VOTE') {
            const target = this.resolveTarget(p.dayVote, ctx, others);
            if (target !== undefined) await this.request('cast_day_vote', { gameId, targetId: target });
        } else if (s.phase === 'TRIBUNAL' && s.tribunal && !s.tribunal.resolved && s.tribunal.defendantUuid !== me.uuid) {
            const vote = typeof p.tribunal === 'function' ? p.tribunal(ctx) : p.tribunal;
            if (vote === 'GUILTY' || vote === 'NOT_GUILTY') {
                await this.request('cast_tribunal_vote', { gameId, dayIndex: s.dayIndex, vote });
            }
        } else if (s.phase === 'NIGHT' && s.nightTurnRole === me.role) {
            if (me.role === 'JOKER' && p.jokerChat) await this.request('submit_joker_chat_message', { gameId, text: p.jokerChat });
            const candidates = me.role === 'JOKER' ? others.filter((pl) => !allies.has(pl.uuid)) : others;
            const target = this.resolveTarget(p.night, ctx, candidates);
            if (target) await this.request('submit_night_action', { gameId, targetId: target });
        } else {
            // 행동 없는 단계는 다음 바퀴에 다시 봄
            done.delete(key);
        }
    }

    async close() {
        this.playing = false;
        await super.close();
    }
}

/**
 * 봇 여러 개 만들고 로그인·소켓 접속까지 (계정은 accounts.createAccount로 새로)
 * @returns {Promise<E2eBot[]>}
 */
async function spawnBots(accounts, { startIndex = 1 } = {}) {
    const bots = accounts.map((account, i) => new E2eBot({ account, index: startIndex + i }));
    // 로그인은 하나씩 (동시에 하면 DB 교착이 더 잦음), 소켓 접속은 한꺼번에
    for (const bot of bots) await bot.login();
    await Promise.all(bots.map((bot) => bot.connect()));
    return bots;
}

module.exports = { E2eBot, spawnBots, FAST_ROOM_SETTINGS, sleep };
