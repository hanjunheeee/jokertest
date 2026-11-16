// 부하 시험 DB 부른 횟수 세기 파일, 부하 앞뒤로 MySQL 셈 값을 읽어 "판 하나당 몇 번 불렀나"를 냄 (읽기만, 시험 DB 전용)
// run.js가 판 돌리기 앞뒤로 부름 + 혼자도 씀: node scripts/loadtest/dbcount.js status|digest|diff (쓰는 법은 docs/게임_의도_2026-11-15/부하_준비.md)
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { assertLocalDatabase, readEnvValues, ALLOWED_DB_NAMES, BLOCKED_DB_NAMES } = require("./target");

// MySQL 셈 값 이름 → 우리 이름 (Questions = 받은 문장 전부, 나머지는 종류별)
const STATUS_NAMES = Object.freeze({
    Questions: "questions",
    Com_select: "select",
    Com_insert: "insert",
    Com_update: "update",
    Com_delete: "delete",
    Com_begin: "begin",
    Com_commit: "commit",
    Com_rollback: "rollback",
});

const round1 = (n) => Math.round(n * 10) / 10;

// ── 방법 1: 서버 전체 셈 값 (SHOW GLOBAL STATUS) ──
// 권한이 필요 없어 시험 DB 계정으로 됨, 대신 같은 MySQL의 다른 DB 일도 같이 세어짐 (재는 동안 다른 시험·개발 서버를 멈춤)

// 지금 셈 값 읽기 → { at: 1763280000000, values: { questions: 120394, select: 80211, … } }
async function readStatus(sequelize) {
    const names = Object.keys(STATUS_NAMES).map((name) => `'${name}'`).join(", ");
    const [rows] = await sequelize.query(`SHOW GLOBAL STATUS WHERE Variable_name IN (${names})`);
    const values = {};
    for (const row of rows) {
        const key = STATUS_NAMES[row.Variable_name ?? row.VARIABLE_NAME];
        if (key) values[key] = Number(row.Value ?? row.VALUE);
    }
    return { at: Date.now(), values };
}

// 앞뒤 차이 → { seconds: 146.2, questions: 812, select: 500, … }, 재는 문장 자신(앞뒤 한 번씩)은 뺌
function diffStatus(before, after) {
    const out = { seconds: round1((after.at - before.at) / 1000) };
    for (const key of Object.values(STATUS_NAMES)) {
        const delta = (after.values[key] ?? 0) - (before.values[key] ?? 0);
        out[key] = key === "questions" ? Math.max(0, delta - 1) : delta;
    }
    return out;
}

// 판 수로 나눔 → { perGame: 135.3, perSecond: 5.6, perGameSecond: 0.9, writesPerGame: 21.5 }
// perGameSecond = 판 하나가 1초에 부른 수 (지난 기록 `docs/부하시험.md` 11장 "DB 질의/초 (판당)"과 같은 셈)
function perGame(diff, games, concurrent = games) {
    if (!games || games <= 0) return { perGame: null, perSecond: null, perGameSecond: null, writesPerGame: null };
    const perSecond = diff.seconds > 0 ? diff.questions / diff.seconds : 0;
    return {
        perGame: round1(diff.questions / games),
        perSecond: round1(perSecond),
        perGameSecond: concurrent > 0 ? Math.round((perSecond / concurrent) * 100) / 100 : null,
        writesPerGame: round1((diff.insert + diff.update + diff.delete) / games),
    };
}

// 화면에 찍을 한 줄
function formatDbLine(diff, games, concurrent = games) {
    const g = perGame(diff, games, concurrent);
    return `DB 질의        전체 ${diff.questions} (${diff.seconds}초) · 판 하나당 ${g.perGame ?? "-"} · 초당 ${g.perSecond ?? "-"} · 판당 초당 ${g.perGameSecond ?? "-"}`
        + ` | 읽기 ${diff.select} · 넣기 ${diff.insert} · 고치기 ${diff.update} · 지우기 ${diff.delete} · 거래 ${diff.begin}`;
}

// ── 방법 2: 문장 모양별 셈 (performance_schema, DB 이름으로 걸러 다른 DB 일이 안 섞임) ──
// 시험 DB 계정엔 권한이 없어 docker 안 root로 읽음 (읽기 문장 하나, DB는 안 건드림)

const DIGEST_CONTAINER = process.env.LOADTEST_DB_CONTAINER || "jokertest-db-1";
const SCHEMA_PATTERN = /^[A-Za-z0-9_]{1,64}$/;

// 볼 DB 이름 검사: 글자 모양 + 개발 DB 아님 + 시험 DB 이름만
function assertDigestSchema(schema, extraAllowed = []) {
    if (!SCHEMA_PATTERN.test(String(schema))) throw new Error(`DB 이름 모양이 틀림: ${schema}`);
    if (BLOCKED_DB_NAMES.includes(schema.toLowerCase())) throw new Error(`개발 DB(${schema})는 안 봄`);
    if (![...ALLOWED_DB_NAMES, ...extraAllowed].includes(schema)) throw new Error(`시험 DB 이름이 아님: ${schema}`);
    return schema;
}

// 문장 모양별 지금 셈 읽기 → { at, schema, rows: { '<모양 id>': { count: 12, text: 'SELECT … FROM `users` WHERE …' } } }
function readDigests(schema, { container = DIGEST_CONTAINER, extraAllowed = [] } = {}) {
    assertDigestSchema(schema, extraAllowed);
    const sql = "SELECT DIGEST, COUNT_STAR, REPLACE(REPLACE(LEFT(DIGEST_TEXT, 220), '\\t', ' '), '\\n', ' ') "
        + `FROM performance_schema.events_statements_summary_by_digest WHERE SCHEMA_NAME = '${schema}';\n`;
    const result = spawnSync("docker", ["exec", "-i", container, "sh", "-c", 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -N -B'], {
        input: sql, encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
    });
    if (result.error) throw new Error(`docker를 못 부름: ${result.error.message}`);
    const errors = String(result.stderr ?? "").split(/\r?\n/).filter((line) => line.trim() && !/Using a password/.test(line));
    if (result.status !== 0 || errors.length > 0) throw new Error(`문장 모양별 셈을 못 읽음: ${errors.join(" | ") || `종료 코드 ${result.status}`}`);
    const rows = {};
    for (const line of String(result.stdout ?? "").split(/\r?\n/)) {
        const [digest, count, ...text] = line.split("\t");
        if (!digest || digest === "NULL") continue;
        rows[digest] = { count: Number(count), text: text.join(" ") };
    }
    return { at: Date.now(), schema, rows };
}

// 앞뒤 차이, 많이 불린 순 → [{ count: 250, perGame: 5, text: '…' }, …]
function diffDigests(before, after, games = 0) {
    const out = [];
    for (const [digest, row] of Object.entries(after.rows)) {
        const delta = row.count - (before.rows[digest]?.count ?? 0);
        if (delta > 0) out.push({ count: delta, perGame: games > 0 ? round1(delta / games) : null, text: row.text });
    }
    return out.sort((a, b) => b.count - a.count);
}

// ── 혼자 쓸 때 ──

const HELP = `DB 부른 횟수 세기 (읽기만)
  status --db-env <파일> [--allow-db <이름>] [--out <파일>]   서버 전체 셈 값 한 번 읽기 (JSON)
  digest --schema joker_e2e [--out <파일>]                    문장 모양별 셈 한 번 읽기 (docker 안 root, JSON)
  diff <앞.json> <뒤.json> [--games N] [--concurrent C] [--top 30]   앞뒤 차이 (status 끼리 또는 digest 끼리)`;

const argOf = (argv, name) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
};

const emit = (argv, value) => {
    const text = JSON.stringify(value, null, 2);
    const out = argOf(argv, "out");
    if (out) { fs.writeFileSync(path.resolve(out), text); console.log(`[DB 셈] ${out}에 적음`); }
    else console.log(text);
};

async function cliStatus(argv) {
    const dbEnv = argOf(argv, "db-env");
    if (dbEnv) Object.assign(process.env, readEnvValues(path.resolve(dbEnv), ["DATABASE_URL"]));
    const allow = String(argOf(argv, "allow-db") ?? "").split(",").filter(Boolean);
    const name = assertLocalDatabase(process.env.DATABASE_URL, process.env.NODE_ENV, { allowDbNames: allow });
    const db = require("../../models");
    db.sequelize.options.logging = false;
    try {
        emit(argv, { kind: "status", database: name, ...(await readStatus(db.sequelize)) });
    } finally {
        await db.sequelize.close();
    }
}

function cliDiff(argv) {
    const files = argv.filter((arg, i) => !arg.startsWith("--") && !(argv[i - 1] ?? "").startsWith("--"));
    if (files.length !== 2) throw new Error("diff <앞.json> <뒤.json>");
    const [before, after] = files.map((file) => JSON.parse(fs.readFileSync(path.resolve(file), "utf8")));
    if (before.kind !== after.kind) throw new Error("앞뒤 파일 종류가 다름 (status 끼리, digest 끼리)");
    const games = Number(argOf(argv, "games") ?? 0);
    const concurrent = Number(argOf(argv, "concurrent") ?? games);
    if (before.kind === "status") {
        const diff = diffStatus(before, after);
        console.log(formatDbLine(diff, games, concurrent));
        return;
    }
    const top = Number(argOf(argv, "top") ?? 30);
    const rows = diffDigests(before, after, games);
    const total = rows.reduce((sum, row) => sum + row.count, 0);
    console.log(`문장 모양 ${rows.length}가지 · 전체 ${total}번${games > 0 ? ` · 판 하나당 ${round1(total / games)}번` : ""} (${round1((after.at - before.at) / 1000)}초)`);
    console.log("횟수 | 판 하나당 | 문장");
    for (const row of rows.slice(0, top)) console.log(`${String(row.count).padStart(6)} | ${String(row.perGame ?? "-").padStart(7)} | ${row.text}`);
}

async function main(argv) {
    const [command, ...rest] = argv;
    if (command === "status") return cliStatus(rest);
    if (command === "digest") {
        const schema = argOf(rest, "schema") ?? "joker_e2e";
        return emit(rest, { kind: "digest", ...readDigests(schema) });
    }
    if (command === "diff") return cliDiff(rest);
    console.log(HELP);
    return undefined;
}

if (require.main === module) {
    main(process.argv.slice(2)).then(() => process.exit(0)).catch((err) => {
        console.error(`[DB 셈] 중단: ${err.message}`);
        process.exit(1);
    });
}

module.exports = { STATUS_NAMES, readStatus, diffStatus, perGame, formatDbLine, assertDigestSchema, readDigests, diffDigests };
