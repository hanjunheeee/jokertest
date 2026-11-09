// 부하 시험 가짜 사용자 파일, 로그인 → 소켓 접속 → 요청마다 응답 시간 재기 → 판 단계 보고 채팅·투표·밤 행동 흉내
// game.js가 판 하나에 여럿 묶어 씀 (화면이 보내는 사건 이름·모양 그대로, Node 여러 개 이동 약속도 화면과 같음)
const { io } = require("socket.io-client");

// 규칙대로 거절한 것과 서버 문제를 나눔 (서버 문제만 오류율에 셈)
const SERVER_ERROR_CODES = new Set(["INTERNAL_ERROR", "DELIVERY_ERROR"]);

// Node 여러 개 이동 약속 (계획 4-5, 화면 shared/constants/connectionSocket.js와 같은 값)
// WRONG_NODE: 접속 거절 → data.node로 다시 붙음, 30초에 3번 넘으면 아무 Node로 한 번 더, 그래도 튕기면 실패
// ROOM_ON_OTHER_NODE: 입장·요청 거절 → node로 옮긴 뒤 같은 요청 한 번만 다시
const NODE_BOUNCE_LIMIT = 3;
const NODE_BOUNCE_WINDOW_MS = 30000;
const NODE_MOVE_TIMEOUT_MS = 10000;
const NODE_ID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;
// 답이 사건(room_join_failed)으로 오는 입장 요청
const JOIN_EVENTS = new Set(["join_room_by_code", "join_public_room"]);

const isNodeId = (node) => typeof node === "string" && NODE_ID_PATTERN.test(node);
const ownerNodeOf = (answer) => (answer?.code === "ROOM_ON_OTHER_NODE" && isNodeId(answer.node) ? answer.node : null);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const pick = (list) => list[Math.floor(Math.random() * list.length)];

class Bot {
    // originHeader: 소켓 접속 때 붙일 Origin (운영 서버는 Origin 없는 소켓 거절, DP-034)
    constructor({ origin, account, index, stats, timeoutMs = 10000, originHeader = null }) {
        this.origin = origin;
        this.originHeader = originHeader;
        this.account = account;
        this.index = index;
        this.stats = stats;
        this.timeoutMs = timeoutMs;
        this.socket = null;
        this.uuid = null;
        this.cookie = null;
        this.closing = false;
        this.waiters = new Map();
        // 지금 가는 Node·WRONG_NODE 튕긴 때·답 기다리는 입장 요청 { event, payload, moved }
        this.node = null;
        this.bounces = [];
        this.pendingJoin = null;
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

    // 소켓 접속: 화면처럼 쿠키(+ 정해진 Origin) 실어 websocket, 끊김은 내가 끊은 것 빼고 셈
    connect() {
        return new Promise((resolve, reject) => {
            const started = performance.now();
            const socket = io(this.origin, {
                transports: ["websocket"],
                extraHeaders: this.originHeader ? { cookie: this.cookie, origin: this.originHeader } : { cookie: this.cookie },
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
                if (this.followWrongNode(err)) return;
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
            // 기다리는 사건 (방 입장·판 시작), 다른 Node 방 거절은 옮긴 뒤 다시 보내고 안 넘김
            for (const event of ["room_joined", "room_join_failed", "game_started"]) {
                socket.on(event, (payload) => {
                    if (event === "room_join_failed" && this.retryJoinOnOwnerNode(payload)) return;
                    if (event !== "game_started") this.pendingJoin = null;
                    const waiter = this.waiters.get(event);
                    if (waiter) { this.waiters.delete(event); waiter(payload); }
                    this.lastEvents = { ...(this.lastEvents ?? {}), [event]: payload };
                });
            }
        });
    }

    // 다음 접속이 갈 Node (?node=) 바꾸기, 같은 소켓 그대로 (socket.io는 접속 때마다 io.opts.query를 읽음)
    pointAt(node) {
        const opts = this.socket.io.opts;
        if (!opts.query || typeof opts.query !== "object") opts.query = {};
        if (isNodeId(node)) opts.query.node = node;
        else delete opts.query.node;
        this.node = isNodeId(node) ? node : null;
    }

    // WRONG_NODE면 알려 준 Node로 다시 붙음 (미들웨어 거절 뒤엔 socket.io가 스스로 안 붙음), 맡았으면 true
    followWrongNode(err) {
        if (err?.message !== "WRONG_NODE" || this.closing) return false;
        const now = Date.now();
        this.bounces = this.bounces.filter((at) => now - at < NODE_BOUNCE_WINDOW_MS);
        this.bounces.push(now);
        if (this.bounces.length > NODE_BOUNCE_LIMIT + 1) return false;
        this.stats.rejection("socket:WRONG_NODE");
        this.pointAt(this.bounces.length <= NODE_BOUNCE_LIMIT ? err?.data?.node : null);
        this.socket.connect();
        return true;
    }

    // 지금 소켓을 node로 옮겨 다시 붙음 (끊고 query 바꿔 다시 붙기), 붙으면 true, 시간 초과면 false
    moveToNode(node) {
        if (!this.socket || !isNodeId(node)) return Promise.resolve(false);
        const started = performance.now();
        return new Promise((resolve) => {
            const finish = (ok) => {
                clearTimeout(timer);
                this.socket.off("connect", onConnect);
                if (ok) this.stats.latency("socket:node_move", performance.now() - started);
                else this.stats.error("socket:node_move_timeout");
                resolve(ok);
            };
            const onConnect = () => finish(true);
            const timer = setTimeout(() => finish(false), NODE_MOVE_TIMEOUT_MS);
            this.socket.on("connect", onConnect);
            this.pointAt(node);
            this.socket.disconnect();
            this.socket.connect();
        });
    }

    // 입장 거절이 다른 Node 방이면 처음 한 번만 옮긴 뒤 같은 요청 다시, 맡았으면 true
    // 옮기기 실패면 NODE_UNAVAILABLE 거절로 기다리는 쪽에 넘김
    retryJoinOnOwnerNode(answer) {
        const join = this.pendingJoin;
        const node = ownerNodeOf(answer);
        if (!join || join.moved || !node) return false;
        join.moved = true;
        this.moveToNode(node).then((ok) => {
            if (this.pendingJoin !== join) return;
            if (ok) { this.socket.emit(join.event, join.payload); return; }
            this.pendingJoin = null;
            const waiter = this.waiters.get("room_join_failed");
            if (waiter) { this.waiters.delete("room_join_failed"); waiter({ code: "NODE_UNAVAILABLE" }); }
        });
        return true;
    }

    // 사건 하나 올 때까지 (이미 왔으면 바로)
    waitFor(event, timeoutMs = this.timeoutMs) {
        return new Promise((resolve) => {
            const timer = setTimeout(() => { this.waiters.delete(event); resolve(null); }, timeoutMs);
            this.waiters.set(event, (payload) => { clearTimeout(timer); resolve(payload); });
        });
    }

    // 답 받는 요청: 응답 시간 재고, 시간 초과·서버 오류는 오류로, 규칙 거절은 거절로
    // 다른 Node 방이라는 답이면 옮긴 뒤 한 번만 다시 (방 만들기·초대 수락·다음 방 묻기, MN-114)
    async request(event, payload, { moved = false } = {}) {
        const started = performance.now();
        try {
            const reply = await this.socket.timeout(this.timeoutMs).emitWithAck(event, payload);
            const node = moved ? null : ownerNodeOf(reply);
            if (node && await this.moveToNode(node)) return this.request(event, payload, { moved: true });
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

    // 답 함수 없는 보내기, 입장 요청이면 다른 Node 거절 때 다시 보내려고 기억함
    emit(event, payload) {
        if (JOIN_EVENTS.has(event)) this.pendingJoin = { event, payload, moved: false };
        this.socket?.emit(event, payload);
    }

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
