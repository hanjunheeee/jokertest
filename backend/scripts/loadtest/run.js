// 부하 시험 입구 파일, 가짜 사용자로 방 만들기·입장·준비·시작·채팅·투표·밤 행동을 끝까지 돌리고 숫자 출력
// 쓰는 법은 docs/부하시험.md (backend 폴더에서 node scripts/loadtest/run.js --games 2 --players 5)
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env"), quiet: true });

const { Stats } = require("./stats");
const { Bot, sleep } = require("./bot");
const { playGame } = require("./game");
const { checkTargetAllowed, assertLocalDatabase, resolveOriginHeader, REMOTE_FLAG } = require("./target");
const { loadAccountsFile, createLocalAccounts, deleteLocalAccounts } = require("./accounts");

// ── 설정값 읽기 ──

const DEFAULTS = {
    target: "http://127.0.0.1:4000",
    mode: "fixed",
    games: 2,
    rounds: 1,
    players: 5,
    stages: "1,5,10,20,50",
    holdMin: 3,
    pollMs: 1000,
    chatChance: 0.5,
    rampMs: 50,
    timeoutMs: 10000,
    gameMaxMin: 15,
    maxP95Ms: 500,
    maxErrorRate: 0.01,
    sampleMs: 5000,
};

function parseArgs(argv) {
    const opts = {
        ...DEFAULTS, accounts: null, allowRemote: false, internalKey: process.env.LOADTEST_INTERNAL_KEY || "", json: false,
        frontendOrigin: process.env.LOADTEST_FRONTEND_ORIGIN || "",
    };
    const camel = (s) => s.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === REMOTE_FLAG) { opts.allowRemote = true; continue; }
        if (arg === "--json") { opts.json = true; continue; }
        if (arg === "--help" || arg === "-h") { opts.help = true; continue; }
        if (!arg.startsWith("--")) throw new Error(`모르는 인자: ${arg}`);
        const [name, inline] = arg.slice(2).split("=");
        const key = camel(name);
        if (!(key in opts)) throw new Error(`모르는 설정: --${name}`);
        const value = inline ?? argv[++i];
        if (value === undefined) throw new Error(`--${name} 값이 없음`);
        opts[key] = typeof DEFAULTS[key] === "number" ? Number(value) : value;
        if (typeof DEFAULTS[key] === "number" && !Number.isFinite(opts[key])) throw new Error(`--${name}은 숫자`);
    }
    if (opts.players < 4 || opts.players > 10) throw new Error("--players는 4~10 (운영 규칙이면 5~10)");
    if (!["fixed", "step"].includes(opts.mode)) throw new Error("--mode는 fixed 또는 step");
    opts.stageList = String(opts.stages).split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0);
    return opts;
}

const HELP = `부하 시험 (docs/부하시험.md)
  --target <주소>          대상 (기본 ${DEFAULTS.target}), 로컬 아니면 ${REMOTE_FLAG} + --accounts 필요
  --mode fixed|step        fixed: 판 N개 한 번에 / step: 동시 판 수를 단계로 올림
  --games N --rounds R     fixed: 동시 판 수·몇 바퀴 (기본 2·1)
  --players N              판당 인원 4~10 (기본 5)
  --stages 1,5,10 --hold-min M   step: 단계별 동시 판 수·단계마다 유지 분
  --max-p95-ms 500 --max-error-rate 0.01   step: 넘으면 멈춤
  --poll-ms 1000 --chat-chance 0.5 --ramp-ms 50 --timeout-ms 10000 --game-max-min 15
  --accounts <파일>        [{email,password}] 목록 (실서버용, gitignore)
  --internal-key <키>      서버 INTERNAL_API_KEY (또는 LOADTEST_INTERNAL_KEY) → 서버 메모리·지연 같이 봄
  --frontend-origin <주소> 소켓 Origin 헤더 (또는 LOADTEST_FRONTEND_ORIGIN), 로컬 아닌 대상은 안 주면 대상 주소, 서버 FRONTEND_URL과 맞춰야 운영 서버가 받음
  --json                   마지막에 JSON 결과도 출력`;

// ── 서버 숫자 엿보기 (/health 내부 열쇠 칸 + /internal/live) ──

function startServerSampler(origin, key, sampleMs) {
    const samples = [];
    if (!key) return { samples, stop: () => {}, latest: () => null, enabled: false };
    let stopped = false;
    const headers = { "x-internal-key": key };
    const tick = async () => {
        try {
            const health = await (await fetch(`${origin}/health`, { headers })).json();
            let live = null;
            try {
                const res = await fetch(`${origin}/internal/live`, { headers });
                if (res.ok) live = await res.json();
            } catch { /* 내부 API 없으면 /health만 */ }
            if (health?.server) samples.push({ at: Date.now(), ...health.server, live: live?.data ?? live ?? null });
        } catch { /* 한 번 못 읽어도 계속 */ }
    };
    const loop = (async () => { while (!stopped) { await tick(); await sleep(sampleMs); } })();
    return {
        samples,
        enabled: true,
        latest: () => samples[samples.length - 1] ?? null,
        stop: async () => { stopped = true; await loop; },
    };
}

const summarizeServer = (samples) => {
    if (samples.length === 0) return null;
    const max = (pick) => Math.max(...samples.map(pick));
    return {
        rssMbMax: max((s) => s.memoryMb.rss),
        heapUsedMbMax: max((s) => s.memoryMb.heapUsed),
        eventLoopP95MsMax: max((s) => s.eventLoopDelayMs.p95),
        eventLoopMaxMs: max((s) => s.eventLoopDelayMs.max),
        onlineUsersMax: max((s) => s.connections.onlineUsers),
        gamesMax: max((s) => s.connections.games),
    };
};

// ── 출력 ──

const pct = (n) => `${(n * 100).toFixed(2)}%`;
const mb = (bytes) => Math.round(bytes / 1024 / 1024);

function printFixed(summary, server, clientMemory) {
    const l = summary.latencyMs;
    console.log("\n== 결과 ==");
    console.log(`접속 성공률   ${pct(summary.connect.rate)} (${summary.connect.ok}/${summary.connect.ok + summary.connect.fail})`);
    console.log(`판            시작 ${summary.games.started} · 끝까지 ${summary.games.ended} · 실패 ${summary.games.failed}`);
    console.log(`응답 시간(ms) 평균 ${l.mean} · 95% ${l.p95} · 최대 ${l.max} (요청 ${l.count})`);
    console.log(`오류          ${summary.errorCount} (${pct(summary.errorRate)}) ${JSON.stringify(summary.errors)}`);
    console.log(`규칙 거절     ${JSON.stringify(summary.rejections)}`);
    console.log(`끊김          ${summary.disconnects}`);
    console.log("사건별(ms)    " + Object.entries(summary.byEvent).map(([e, s]) => `${e} ${s.mean}/${s.p95}/${s.max}(${s.count})`).join(" | "));
    console.log(`시험 쪽 메모리 rss ${mb(clientMemory.rss)}MB`);
    if (server) console.log(`서버          rss 최대 ${server.rssMbMax}MB · heap ${server.heapUsedMbMax}MB · 이벤트 루프 지연 95% 최대 ${server.eventLoopP95MsMax}ms · 접속 최대 ${server.onlineUsersMax} · 판 최대 ${server.gamesMax}`);
    else console.log("서버          (내부 열쇠 없음 — 서버 숫자 안 봄)");
}

function printStageTable(rows) {
    console.log("\n== 단계별 ==");
    console.log("동시판 | 요청 | 평균ms | 95%ms | 최대ms | 오류율 | 끊김 | 판 끝/실패 | 서버rss MB | 루프지연95% ms | 판정");
    for (const r of rows) {
        const s = r.summary;
        console.log([
            String(r.concurrent).padStart(6), s.latencyMs.count, s.latencyMs.mean, s.latencyMs.p95, s.latencyMs.max,
            pct(s.errorRate), s.disconnects, `${s.games.ended}/${s.games.failed}`,
            r.server?.rssMbMax ?? "-", r.server?.eventLoopP95MsMax ?? "-", r.pass ? "통과" : `멈춤(${r.reason})`,
        ].join(" | "));
    }
}

// ── 가짜 사용자 준비 ──

async function prepareBots(origin, accounts, stats, opts) {
    const bots = accounts.map((account, index) => new Bot({
        origin, account, index: index + 1, stats, timeoutMs: opts.timeoutMs, originHeader: opts.originHeader,
    }));
    const ready = [];
    await Promise.all(bots.map(async (bot, i) => {
        await sleep(i * opts.rampMs);
        try {
            await bot.login();
            await bot.connect();
            ready.push(bot);
        } catch (err) {
            if (!opts.json) console.warn(`[부하] ${bot.index}번 준비 실패: ${err.message}`);
            await bot.close();
        }
    }));
    return ready.sort((a, b) => a.index - b.index);
}

// 판 묶음 하나가 끝날 때까지 판을 이어서 돌림 (until 전까지 새 판 시작)
async function gameLoop(group, opts, getStats, until) {
    const results = [];
    do {
        results.push(await playGame(group, { pollMs: opts.pollMs, chatChance: opts.chatChance, gameMaxMs: opts.gameMaxMin * 60000, stats: getStats() }));
    } while (Date.now() < until());
    return results;
}

// fixed: 판 N개를 한 번에, rounds바퀴
async function runFixed(groups, opts, stats, sampler) {
    const started = Date.now();
    for (let round = 0; round < opts.rounds; round += 1) {
        const results = await Promise.all(groups.slice(0, opts.games).map((group) => playGame(group, {
            pollMs: opts.pollMs, chatChance: opts.chatChance, gameMaxMs: opts.gameMaxMin * 60000, stats,
        })));
        console.log(`[부하] ${round + 1}바퀴 판 결과: ${results.join(" / ")}`);
    }
    const summary = stats.summary();
    const server = summarizeServer(sampler.samples);
    printFixed(summary, server, process.memoryUsage());
    console.log(`걸린 시간     ${Math.round((Date.now() - started) / 1000)}초`);
    return { mode: "fixed", summary, server };
}

// step: 동시 판 수를 단계로 올리며 기준 넘으면 멈춤
async function runStep(groups, bots, opts, sampler) {
    const rows = [];
    let maxOk = 0;
    const baseline = sampler.latest()?.memoryMb?.rss ?? null;
    for (const concurrent of opts.stageList) {
        if (concurrent > groups.length) { console.warn(`[부하] ${concurrent}판에 필요한 사용자가 모자라 멈춤`); break; }
        const stats = new Stats();
        for (const bot of bots) bot.setStats(stats);
        const sampleFrom = sampler.samples.length;
        const holdUntil = Date.now() + opts.holdMin * 60000;
        console.log(`[부하] 단계 시작: 동시 ${concurrent}판, ${opts.holdMin}분 유지`);
        await Promise.all(groups.slice(0, concurrent).map((group) => gameLoop(group, opts, () => stats, () => holdUntil)));
        const summary = stats.summary();
        const server = summarizeServer(sampler.samples.slice(sampleFrom));
        const reasons = [];
        if (summary.latencyMs.p95 > opts.maxP95Ms) reasons.push(`95% ${summary.latencyMs.p95}ms>${opts.maxP95Ms}`);
        if (summary.errorRate > opts.maxErrorRate) reasons.push(`오류율 ${pct(summary.errorRate)}>${pct(opts.maxErrorRate)}`);
        const row = { concurrent, summary, server, pass: reasons.length === 0, reason: reasons.join(", ") };
        if (server && baseline !== null) row.memoryPerGameMb = Math.round(((server.rssMbMax - baseline) / concurrent) * 10) / 10;
        rows.push(row);
        printStageTable(rows);
        if (!row.pass) break;
        maxOk = concurrent;
    }
    console.log(`\n버틴 최대 동시 판 수: ${maxOk}판 (사용자 ${maxOk * opts.players}명)`);
    const perGame = rows.filter((r) => r.pass && r.memoryPerGameMb !== undefined).map((r) => r.memoryPerGameMb);
    if (perGame.length > 0) console.log(`판당 서버 메모리 대략: ${perGame[perGame.length - 1]}MB (rss 증가 ÷ 동시 판)`);
    return { mode: "step", maxConcurrentGames: maxOk, stages: rows };
}

// ── 본 실행 ──

async function main() {
    const opts = parseArgs(process.argv.slice(2));
    if (opts.help) { console.log(HELP); return; }

    const { origin, local } = checkTargetAllowed({
        target: opts.target, allowRemote: opts.allowRemote, accountsFile: opts.accounts, blocked: process.env.LOADTEST_BLOCKED_TARGETS,
    });
    opts.originHeader = resolveOriginHeader({ frontendOrigin: opts.frontendOrigin, targetOrigin: origin, local });
    const needed = opts.players * (opts.mode === "step" ? Math.max(...opts.stageList) : opts.games);

    // 계정: 파일이 있으면 파일, 없으면(로컬만) 로컬 DB에 만들고 끝나면 지움
    let db = null;
    let accounts;
    if (opts.accounts) {
        accounts = loadAccountsFile(path.resolve(opts.accounts));
    } else {
        if (!local) throw new Error("로컬 아닌 대상은 --accounts가 필요");
        assertLocalDatabase(process.env.DATABASE_URL, process.env.NODE_ENV);
        db = require("../../models");
        db.sequelize.options.logging = false;
        accounts = await createLocalAccounts(db, needed);
        console.log(`[부하] 로컬 시험 계정 ${accounts.length}개 만듦 (loadtest+N@example.test, 비번은 이번 실행에서만)`);
    }
    if (accounts.length < needed) throw new Error(`계정이 모자람: 필요 ${needed}, 있음 ${accounts.length}`);
    accounts = accounts.slice(0, needed);

    console.log(`[부하] 대상 ${origin} · 방식 ${opts.mode} · 판당 ${opts.players}명 · 사용자 ${needed}명 · 소켓 Origin ${opts.originHeader ?? "없음"}`);
    const sampler = startServerSampler(origin, opts.internalKey, opts.sampleMs);
    const setupStats = new Stats();
    let bots = [];
    let output;
    try {
        bots = await prepareBots(origin, accounts, setupStats, opts);
        console.log(`[부하] 접속 ${bots.length}/${accounts.length}`);
        const groups = [];
        for (let i = 0; i + opts.players <= bots.length; i += opts.players) groups.push(bots.slice(i, i + opts.players));

        output = opts.mode === "fixed"
            ? await runFixed(groups, opts, setupStats, sampler)
            : await runStep(groups, bots, opts, sampler);
    } finally {
        await Promise.all(bots.map((bot) => bot.close()));
        await sampler.stop();
        if (db) {
            const removed = await deleteLocalAccounts(db).catch((err) => { console.error(`[부하] 시험 계정 지우기 실패: ${err.message}`); return 0; });
            console.log(`[부하] 로컬 시험 계정 ${removed}개 지움`);
            await db.sequelize.close();
        }
    }
    if (opts.json && output) console.log(JSON.stringify(output, null, 2));
}

if (require.main === module) {
    main().then(() => process.exit(0)).catch((err) => {
        console.error(`[부하] 중단: ${err.message}`);
        process.exit(1);
    });
}

module.exports = { parseArgs, summarizeServer };
