// 부하 시험 입구 파일, 가짜 사용자로 방 만들기·입장·준비·시작·채팅·투표·밤 행동을 끝까지 돌리고 숫자 출력
// 쓰는 법은 docs/게임_의도_2026-11-15/부하_준비.md·docs/부하시험.md (backend 폴더에서 node scripts/loadtest/run.js --db-env ../e2e/.env.e2e --games 2 --players 5)
const fs = require("fs");
const path = require("path");

const { Stats } = require("./stats");
const { Bot, sleep } = require("./bot");
const { playGame } = require("./game");
const { checkTargetAllowed, assertLocalDatabase, resolveOriginHeader, parseTarget } = require("./target");
const { parseArgs, loadEnv, HELP } = require("./options");
const { loadAccountsFile, createLocalAccounts, deleteLocalAccounts } = require("./accounts");
const { readStatus, diffStatus, perGame, formatDbLine, readDigests, diffDigests } = require("./dbcount");
const { startServerSampler, summarizeServer } = require("./sampler");
const { pct, printFixed, printStageTable, printStatements, judgeFixed } = require("./report");

// ── DB 부른 횟수 (시험 계정을 만든 DB에 붙어 있을 때만) ──

// 판 돌리기 앞뒤로 셈 값을 읽는 틀: before() → 판 → after(끝난 판 수, 동시 판 수) → { diff, …판당 값, line, statements }
// digestSchema를 주면 문장 모양별 셈도 같이 읽음 (그 DB 것만 세어 다른 DB 일이 안 섞임)
// 못 읽으면(권한·끊김·docker 없음) 그 숫자만 빼고 계속 돎
function dbCounter(db, { digestSchema = null, extraAllowed = [], settleMs = 1500 } = {}) {
    let before = null;
    let digestsBefore = null;
    const digests = () => {
        if (!digestSchema) return null;
        try { return readDigests(digestSchema, { extraAllowed }); } catch (err) { console.warn(`[부하] ${err.message}`); return null; }
    };
    return {
        async before() {
            if (!db) return;
            digestsBefore = digests();
            before = await readStatus(db.sequelize).catch(() => null);
        },
        async after(games, concurrent) {
            if (!db || !before) return null;
            // 판 끝 뒤 늦게 도는 쓰기(업적·골드)가 마저 세어지게 잠깐 기다림
            await sleep(settleMs);
            const after = await readStatus(db.sequelize).catch(() => null);
            if (!after) return null;
            const diff = diffStatus(before, after);
            const result = { diff, ...perGame(diff, games, concurrent), line: formatDbLine(diff, games, concurrent) };
            const digestsAfter = digestsBefore ? digests() : null;
            if (digestsAfter) {
                const rows = diffDigests(digestsBefore, digestsAfter, games);
                result.statementTotal = rows.reduce((sum, row) => sum + row.count, 0);
                // 시험 DB 것만으로 낸 "판 하나가 1초에 부른 수" (서버 전체 셈은 다른 DB 일이 섞일 수 있음)
                result.statementPerGameSecond = diff.seconds > 0 && concurrent > 0
                    ? Math.round((result.statementTotal / diff.seconds / concurrent) * 100) / 100 : null;
                result.statements = rows.slice(0, 40);
            }
            return result;
        },
    };
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
            // 준비 못 한 사용자는 문제로 셈 (로그인 거절은 봇이 규칙 거절로만 세서, 안 세면 판 수만 조용히 줄어듦)
            stats.error("setup:bot_not_ready");
            if (!opts.json) console.warn(`[부하] ${bot.index}번 준비 실패: ${err.message}`);
            await bot.close();
        }
    }));
    return ready.sort((a, b) => a.index - b.index);
}

// 판 묶음 하나가 끝날 때까지 판을 이어서 돌림 (until 전까지 새 판 시작)
// 실패한 판 뒤엔 잠깐 쉼 (안 쉬면 방 만들기를 퍼부어 소켓 사건 수 제한에 걸려 끊김)
async function gameLoop(group, opts, getStats, until) {
    const results = [];
    do {
        const result = await playGame(group, { pollMs: opts.pollMs, chatChance: opts.chatChance, gameMaxMs: opts.gameMaxMin * 60000, stats: getStats() });
        results.push(result);
        if (result !== "ENDED") await sleep(opts.failPauseMs);
    } while (Date.now() < until());
    return results;
}

// fixed: 판 N개를 한 번에, rounds바퀴
async function runFixed(groups, opts, stats, sampler, counter) {
    const started = Date.now();
    // 사용자가 모자라 못 차린 판도 실패로 셈
    const missing = Math.max(0, opts.games - groups.length);
    if (missing > 0) {
        stats.gamesFailed += missing * opts.rounds;
        console.warn(`[부하] 사용자가 모자라 ${opts.games}판 중 ${missing}판을 못 차림`);
    }
    await counter.before();
    for (let round = 0; round < opts.rounds; round += 1) {
        const results = await Promise.all(groups.slice(0, opts.games).map((group) => playGame(group, {
            pollMs: opts.pollMs, chatChance: opts.chatChance, gameMaxMs: opts.gameMaxMin * 60000, stats,
        })));
        console.log(`[부하] ${round + 1}바퀴 판 결과: ${results.join(" / ")}`);
    }
    const db = await counter.after(stats.gamesEnded, Math.min(opts.games, groups.length));
    const summary = stats.summary();
    const server = summarizeServer(sampler.samples);
    printFixed(summary, server, process.memoryUsage(), db?.line ?? null);
    printStatements(db, stats.gamesEnded);
    console.log(`걸린 시간     ${Math.round((Date.now() - started) / 1000)}초`);
    return { mode: "fixed", players: opts.players, summary, server, db };
}

// step: 동시 판 수를 단계로 올리며 기준 넘으면 멈춤
async function runStep(groups, bots, opts, sampler, counter) {
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
        await counter.before();
        await Promise.all(groups.slice(0, concurrent).map((group) => gameLoop(group, opts, () => stats, () => holdUntil)));
        const db = await counter.after(stats.gamesEnded, concurrent);
        const summary = stats.summary();
        const server = summarizeServer(sampler.samples.slice(sampleFrom));
        const reasons = [];
        if (summary.latencyMs.p95 > opts.maxP95Ms) reasons.push(`95% ${summary.latencyMs.p95}ms>${opts.maxP95Ms}`);
        if (summary.errorRate > opts.maxErrorRate) reasons.push(`오류율 ${pct(summary.errorRate)}>${pct(opts.maxErrorRate)}`);
        const row = { concurrent, summary, server, db, pass: reasons.length === 0, reason: reasons.join(", ") };
        if (server && baseline !== null) row.memoryPerGameMb = Math.round(((server.rssMbMax - baseline) / concurrent) * 10) / 10;
        rows.push(row);
        printStageTable(rows);
        if (db) console.log(db.line);
        printStatements(db, stats.gamesEnded);
        if (!row.pass) break;
        maxOk = concurrent;
    }
    console.log(`\n버틴 최대 동시 판 수: ${maxOk}판 (사용자 ${maxOk * opts.players}명)`);
    const perGameMemory = rows.filter((r) => r.pass && r.memoryPerGameMb !== undefined).map((r) => r.memoryPerGameMb);
    if (perGameMemory.length > 0) console.log(`판당 서버 메모리 대략: ${perGameMemory[perGameMemory.length - 1]}MB (rss 증가 ÷ 동시 판)`);
    return { mode: "step", players: opts.players, maxConcurrentGames: maxOk, stages: rows };
}

// 계정 준비: 파일이 있으면 파일, 없으면(로컬만) 시험 DB에 만듦 (개발 DB면 여기서 멈춤) → { db, dbName, accounts }
async function prepareAccounts(opts, local, needed) {
    if (opts.accounts) return { db: null, dbName: null, accounts: loadAccountsFile(path.resolve(opts.accounts)) };
    if (!local) throw new Error("로컬 아닌 대상은 --accounts가 필요");
    const dbName = assertLocalDatabase(process.env.DATABASE_URL, process.env.NODE_ENV, { allowDbNames: opts.allowDbList });
    const db = require("../../models");
    db.sequelize.options.logging = false;
    // 주소로 본 이름과 진짜 붙은 DB가 같은지 한 번 더 봄
    const [[{ name: connectedName }]] = await db.sequelize.query("SELECT DATABASE() AS name");
    if (connectedName !== dbName) throw new Error(`엉뚱한 DB에 붙음: ${connectedName}`);
    // 만들다 실패하면 만든 데까지 지우고 멈춤 (반쯤 만든 계정이 시험 DB에 안 남게)
    const accounts = await createLocalAccounts(db, needed).catch(async (err) => {
        await deleteLocalAccounts(db).catch(() => {});
        await db.sequelize.close();
        throw new Error(`시험 계정 만들기 실패: ${err.message}`);
    });
    console.log(`[부하] 시험 DB ${dbName}에 시험 계정 ${accounts.length}개 만듦 (loadtest+N@example.test, 비번은 이번 실행에서만)`);
    return { db, dbName, accounts };
}

// 시험 계정 지우기: 서버가 판 끝 기록을 아직 쓰는 중이면 외래키에 막힘 → 잠깐 쉬고 다시 (3번까지)
async function removeAccounts(db) {
    let removed = null;
    for (let attempt = 1; removed === null && attempt <= 3; attempt += 1) {
        removed = await deleteLocalAccounts(db).catch(async (err) => {
            console.error(`[부하] 시험 계정 지우기 실패(${attempt}번째): ${err.message}`);
            await sleep(1500);
            return null;
        });
    }
    console.log(removed === null ? "[부하] 시험 계정을 못 지움 → node scripts/loadtest/run.js --db-env <파일> --cleanup" : `[부하] 시험 계정 ${removed}개 지움`);
}

// ── 본 실행 ──

async function main() {
    const opts = parseArgs(process.argv.slice(2));
    if (opts.help) { console.log(HELP); return; }
    loadEnv(opts);

    // 남은 시험 계정만 지우기 (중간에 꺼져서 덜 지워졌을 때), DB 검사는 같음
    if (opts.cleanup) {
        const name = assertLocalDatabase(process.env.DATABASE_URL, process.env.NODE_ENV, { allowDbNames: opts.allowDbList });
        const cleanupDb = require("../../models");
        cleanupDb.sequelize.options.logging = false;
        try {
            console.log(`[부하] 시험 DB ${name}에 남은 시험 계정 ${await deleteLocalAccounts(cleanupDb)}개 지움`);
        } finally {
            await cleanupDb.sequelize.close();
        }
        return;
    }

    const { origin, local } = checkTargetAllowed({
        target: opts.target, allowRemote: opts.allowRemote, accountsFile: opts.accounts, blocked: process.env.LOADTEST_BLOCKED_TARGETS,
    });
    opts.originHeader = resolveOriginHeader({ frontendOrigin: opts.frontendOrigin, targetOrigin: origin, local });
    // 서버 숫자를 읽을 주소도 같은 검사 (개발 서버 포트·운영 목록 거부)
    const sampleOrigins = opts.sampleUrlList.length > 0
        ? opts.sampleUrlList.map((url) => checkTargetAllowed({
            target: parseTarget(url).origin, allowRemote: opts.allowRemote, accountsFile: opts.accounts, blocked: process.env.LOADTEST_BLOCKED_TARGETS,
        }).origin)
        : [origin];
    const needed = opts.players * (opts.mode === "step" ? Math.max(...opts.stageList) : opts.games);

    const prepared = await prepareAccounts(opts, local, needed);
    const { db, dbName } = prepared;
    let { accounts } = prepared;
    if (accounts.length < needed) throw new Error(`계정이 모자람: 필요 ${needed}, 있음 ${accounts.length}`);
    accounts = accounts.slice(0, needed);

    console.log(`[부하] 대상 ${origin} · 방식 ${opts.mode} · 판당 ${opts.players}명 · 사용자 ${needed}명 · 소켓 Origin ${opts.originHeader ?? "없음"}`);
    const sampler = startServerSampler(sampleOrigins, opts.internalKey, opts.sampleMs);
    const counter = dbCounter(db, { digestSchema: opts.dbDigest ? dbName : null, extraAllowed: opts.allowDbList });
    const setupStats = new Stats();
    let bots = [];
    let output;
    try {
        bots = await prepareBots(origin, accounts, setupStats, opts);
        console.log(`[부하] 접속 ${bots.length}/${accounts.length}`);
        const groups = [];
        for (let i = 0; i + opts.players <= bots.length; i += opts.players) groups.push(bots.slice(i, i + opts.players));

        output = opts.mode === "fixed"
            ? await runFixed(groups, opts, setupStats, sampler, counter)
            : await runStep(groups, bots, opts, sampler, counter);
        output.setup = { accounts: accounts.length, connected: bots.length, errors: Object.fromEntries(setupStats.errors) };
        // fixed는 통과·실패 한 줄을 찍고 실패면 종료 코드 2 (step은 단계 표의 판정을 봄)
        if (opts.mode === "fixed") {
            output.verdict = judgeFixed({ summary: output.summary, accounts: accounts.length, connected: bots.length, expectedGames: opts.games * opts.rounds });
        }
    } finally {
        await Promise.all(bots.map((bot) => bot.close()));
        await sampler.stop();
        if (db) {
            await removeAccounts(db);
            await db.sequelize.close();
        }
    }
    if (opts.out && output) {
        fs.writeFileSync(path.resolve(opts.out), JSON.stringify(output, null, 2));
        console.log(`[부하] 결과를 ${opts.out}에 적음`);
    }
    if (opts.json && output) console.log(JSON.stringify(output, null, 2));
    if (output?.verdict) console.log(output.verdict.line);
    return output?.verdict?.ok !== false;
}

if (require.main === module) {
    main().then((ok) => process.exit(ok === false ? 2 : 0)).catch((err) => {
        console.error(`[부하] 중단: ${err.message}`);
        process.exit(1);
    });
}

module.exports = { parseArgs, loadEnv, summarizeServer, dbCounter };
