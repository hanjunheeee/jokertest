// 부하 시험 가짜 사용자 파일, 로그인 → 소켓 접속 → 요청마다 응답 시간 재기 → 판 단계 보고 채팅·투표·밤 행동 흉내
// game.js가 판 하나에 여럿 묶어 씀 (화면이 보내는 사건 이름·모양 그대로)
const { io } = require("socket.io-client");

// 규칙대로 거절한 것과 서버 문제를 나눔 (서버 문제만 오류율에 셈)
const SERVER_ERROR_CODES = new Set(["INTERNAL_ERROR", "DELIVERY_ERROR"]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const pick = (list) => list[Math.floor(Math.random() * list.length)];

class Bot {
    constructor({ origin, account, index, stats, timeoutMs = 10000 }) {
        this.origin = origin;
        this.account = account;
        this.index = index;
        this.stats = stats;
        this.timeoutMs = timeoutMs;
        this.socket = null;
        this.uuid = null;
        this.cookie = null;
        this.closing = false;
        this.waiters = new Map();
    }

    // 단계가 바뀌면 숫자를 새 Stats에 모으게
    setStats(stats) { this.stats = stats; }

    // 로그인: accessToken 쿠키만 꺼내 들고 있음 (화면에 안 찍음)
    async login() {
        const started = performance.now();
        let res;
        try {
            res = await fetch(`${this.origin}/auth/login`, {
                method: "POST",
                headers: { "content-type": "application/json", "user-agent": "mmc-loadtest" },
                body: JSON.stringify({ email: this.account.email, password: this.account.password }),
            });
        } catch {
            this.stats.error("http:login:network");
            throw new Error("로그인 요청 실패(네트워크)");
        }
        const elapsed = performance.now() - started;
        if (res.status >= 500) { this.stats.error(`http:login:${res.status}`); throw new Error(`로그인 ${res.status}`); }
        if (!res.ok) { this.stats.rejection(`http:login:${res.status}`); throw new Error(`로그인 거절 ${res.status}`); }
        this.stats.latency("http:login", elapsed);
        const body = await res.json();
        this.uuid = body?.data?.user?.uuid ?? null;
        const setCookies = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
        const access = setCookies.map((line) => line.split(";")[0]).find((pair) => pair.startsWith("accessToken="));
        if (!access) throw new Error("로그인 응답에 accessToken 쿠키가 없음");
        this.cookie = access;
    }

    // 소켓 접속: 화면처럼 쿠키 실어 websocket, 끊김은 내가 끊은 것 빼고 셈
    connect() {
        return new Promise((resolve, reject) => {
            const started = performance.now();
            const socket = io(this.origin, {
                transports: ["websocket"],
                extraHeaders: { cookie: this.cookie },
                reconnection: true,
                reconnectionAttempts: 5,
                timeout: this.timeoutMs,
            });
            this.socket = socket;
            let settled = false;
            socket.once("connect", () => {
                settled = true;
                this.stats.connectOk += 1;
                this.stats.latency("socket:connect", performance.now() - started);
                resolve();
            });
            socket.on("connect_error", (err) => {
                if (settled) return;
                settled = true;
                this.stats.connectFail += 1;
                this.stats.error("socket:connect_error");
                socket.close();
                reject(new Error(`소켓 접속 실패: ${err?.message ?? err}`));
            });
            socket.on("disconnect", (reason) => {
                if (!this.closing && reason !== "io client disconnect") this.stats.disconnects += 1;
            });
            // 기다리는 사건 (방 입장·판 시작)
            for (const event of ["room_joined", "room_join_failed", "game_started"]) {
                socket.on(event, (payload) => {
                    const waiter = this.waiters.get(event);
                    if (waiter) { this.waiters.delete(event); waiter(payload); }
                    this.lastEvents = { ...(this.lastEvents ?? {}), [event]: payload };
                });
            }
        });
    }

    // 사건 하나 올 때까지 (이미 왔으면 바로)
    waitFor(event, timeoutMs = this.timeoutMs) {
        return new Promise((resolve) => {
            const timer = setTimeout(() => { this.waiters.delete(event); resolve(null); }, timeoutMs);
            this.waiters.set(event, (payload) => { clearTimeout(timer); resolve(payload); });
        });
    }

    // 답 받는 요청: 응답 시간 재고, 시간 초과·서버 오류는 오류로, 규칙 거절은 거절로
    async request(event, payload) {
        const started = performance.now();
        try {
            const reply = await this.socket.timeout(this.timeoutMs).emitWithAck(event, payload);
            this.stats.latency(event, performance.now() - started);
            if (reply && reply.ok === false) {
                const code = reply.code ?? "NO_CODE";
                if (SERVER_ERROR_CODES.has(code)) this.stats.error(`${event}:${code}`);
                else this.stats.rejection(`${event}:${code}`);
            }
            return reply;
        } catch {
            this.stats.error(`${event}:timeout`);
            return null;
        }
    }

    emit(event, payload) { this.socket?.emit(event, payload); }

    // 판 한 바퀴: 판이 끝날 때까지 스냅샷 보고 단계마다 한 번씩 행동
    async playUntilEnded(gameId, { pollMs, chatChance, maxMs }) {
        const done = new Set();
        const deadline = Date.now() + maxMs;
        while (!this.closing && Date.now() < deadline) {
            const reply = await this.request("get_session_snapshot", { gameId });
            // 스냅샷은 답 안에 펼쳐 옴, 판에서 빠졌으면 끝 (다시 불러오는 중 같은 거절은 다음 바퀴에)
            const snapshot = reply?.ok ? reply : null;
            if (reply?.ok === false && ["FORFEITED_FROM_SESSION", "NOT_A_PARTICIPANT", "GAME_ID_MISMATCH"].includes(reply.code)) {
                return "LOST";
            }
            if (snapshot?.phase === "ENDED") return "ENDED";
            if (snapshot?.phase) await this.act(gameId, snapshot, done, chatChance);
            await sleep(pollMs);
        }
        return "TIMEOUT";
    }

    // 단계별 행동 (한 단계에 한 번): 낮 토론 채팅+준비 / 낮 투표 / 재판 표 / 내 밤 차례 행동
    async act(gameId, s, done, chatChance) {
        const me = s.self;
        const meAlive = s.players?.find((p) => p.uuid === me?.uuid)?.isAlive === true;
        if (!me || !meAlive) return;
        const allies = new Set(me.allies ?? []);
        const others = (s.players ?? []).filter((p) => p.isAlive && p.isParticipating && p.uuid !== me.uuid);
        const targets = me.role === "JOKER" ? others.filter((p) => !allies.has(p.uuid)) : others;
        const key = [s.phase, s.dayIndex, s.dayPhase ?? "", s.nightTurnRole ?? "", s.tribunal?.defendantUuid ?? ""].join(":");
        if (done.has(key)) return;
        done.add(key);

        if (s.phase === "DAY" && s.dayPhase === "DAY_DISCUSSION") {
            if (Math.random() < chatChance) {
                await this.request("submit_game_chat_message", { gameId, text: `부하 시험 ${this.index} 말함` });
            }
            await this.request("ready_for_day_vote", { gameId });
        } else if (s.phase === "DAY" && s.dayPhase === "DAY_VOTE" && targets.length > 0) {
            await this.request("cast_day_vote", { gameId, targetId: pick(targets).uuid });
        } else if (s.phase === "TRIBUNAL" && s.tribunal && !s.tribunal.resolved && s.tribunal.defendantUuid !== me.uuid) {
            await this.request("cast_tribunal_vote", {
                gameId, dayIndex: s.dayIndex, vote: Math.random() < 0.7 ? "GUILTY" : "NOT_GUILTY",
            });
        } else if (s.phase === "NIGHT" && s.nightTurnRole === me.role && targets.length > 0) {
            if (me.role === "JOKER" && allies.size > 0 && Math.random() < chatChance) {
                await this.request("submit_joker_chat_message", { gameId, text: "부하 시험 광대 채팅" });
            }
            await this.request("submit_night_action", { gameId, targetId: pick(targets).uuid });
        } else {
            // 행동 없는 단계는 다음에 다시 봄
            done.delete(key);
        }
    }

    async close() {
        this.closing = true;
        this.socket?.close();
    }
}

module.exports = { Bot, sleep, SERVER_ERROR_CODES };
