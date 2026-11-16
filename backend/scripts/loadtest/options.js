// 부하 시험 설정값 파일, 명령 줄 인자 읽기 + 환경값(DB 주소·내부 열쇠) 읽기 + 도움말
// run.js가 맨 처음 부름 (--db-env를 주면 backend/.env를 안 읽게 하는 곳)
const path = require("path");
const { readEnvValues, REMOTE_FLAG } = require("./target");

// 기본 대상은 시험 서버 앞단(4100), 개발 서버(4000)는 target.js가 거부함
const DEFAULTS = {
    target: "http://127.0.0.1:4100",
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
    failPauseMs: 3000,
};

function parseArgs(argv) {
    const opts = {
        ...DEFAULTS, accounts: null, allowRemote: false, internalKey: process.env.LOADTEST_INTERNAL_KEY || "", json: false,
        frontendOrigin: process.env.LOADTEST_FRONTEND_ORIGIN || "",
        dbEnv: null, allowDb: "", sampleUrls: "", out: null, dbDigest: false, cleanup: false,
    };
    const camel = (s) => s.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === REMOTE_FLAG) { opts.allowRemote = true; continue; }
        if (arg === "--json") { opts.json = true; continue; }
        if (arg === "--db-digest") { opts.dbDigest = true; continue; }
        if (arg === "--cleanup") { opts.cleanup = true; continue; }
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
    if (opts.players < 5 || opts.players > 10) throw new Error("--players는 5~10");
    if (!["fixed", "step"].includes(opts.mode)) throw new Error("--mode는 fixed 또는 step");
    opts.stageList = String(opts.stages).split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0);
    // 쉼표로 나눈 값들 → ['joker_x'] / ['http://127.0.0.1:4101', 'http://127.0.0.1:4102']
    opts.allowDbList = String(opts.allowDb).split(",").map((item) => item.trim()).filter(Boolean);
    opts.sampleUrlList = String(opts.sampleUrls).split(",").map((item) => item.trim()).filter(Boolean);
    return opts;
}

const HELP = `부하 시험 (docs/게임_의도_2026-11-15/부하_준비.md)
  --target <주소>          대상 (기본 ${DEFAULTS.target}), 로컬 4000번(개발 서버)은 거부, 로컬 아니면 ${REMOTE_FLAG} + --accounts 필요
  --db-env <파일>          시험 계정을 만들 DB 값 파일 (예 ../e2e/.env.e2e, DATABASE_URL·INTERNAL_API_KEY만 읽음), 주면 backend/.env는 안 읽음
  --allow-db <이름,…>      허용 이름(joker_e2e·joker_loadtest) 밖 시험 DB를 쓸 때, 개발 DB(joker·joker_realgame)는 줘도 거부
  --mode fixed|step        fixed: 판 N개 한 번에 / step: 동시 판 수를 단계로 올림
  --games N --rounds R     fixed: 동시 판 수·몇 바퀴 (기본 2·1)
  --players N              판당 인원 5~10 (기본 5)
  --stages 1,5,10 --hold-min M   step: 단계별 동시 판 수·단계마다 유지 분
  --max-p95-ms 500 --max-error-rate 0.01   step: 넘으면 멈춤
  --poll-ms 1000 --chat-chance 0.5 --ramp-ms 50 --timeout-ms 10000 --game-max-min 15 --fail-pause-ms 3000
  --accounts <파일>        [{email,password}] 목록 (실서버용, gitignore)
  --internal-key <키>      서버 INTERNAL_API_KEY (또는 LOADTEST_INTERNAL_KEY, --db-env 파일 값) → 서버 메모리·지연 같이 봄
  --sample-urls <주소,…>   서버 숫자를 읽을 주소들 (서버 2대면 http://127.0.0.1:4101,http://127.0.0.1:4102), 안 주면 대상 주소
  --frontend-origin <주소> 소켓 Origin 헤더 (또는 LOADTEST_FRONTEND_ORIGIN), 로컬 아닌 대상은 안 주면 대상 주소, 서버 FRONTEND_URL과 맞춰야 운영 서버가 받음
  --db-digest              DB 문장 모양별로 판 하나당 몇 번 불렸는지도 냄 (docker 안 DB에서 읽기만, 시험 DB 이름으로 거름)
  --out <파일>             결과 JSON을 파일로 저장
  --cleanup                부하는 안 걸고 시험 DB에 남은 시험 계정(loadtest+N@example.test)만 지우고 끝
  --json                   마지막에 JSON 결과도 출력`;

// 환경값 읽기: --db-env를 주면 그 파일의 DB 주소·내부 열쇠만 (backend/.env는 개발 DB를 가리켜서 안 읽음)
// 안 주면 예전처럼 backend/.env (그 DB가 개발 DB면 뒤에서 거부됨), 이미 밖에서 준 값은 안 덮음
function loadEnv(opts) {
    if (opts.dbEnv) {
        const values = readEnvValues(path.resolve(opts.dbEnv), ["DATABASE_URL", "INTERNAL_API_KEY"]);
        if (!values.DATABASE_URL) throw new Error(`--db-env 파일에 DATABASE_URL이 없음: ${opts.dbEnv}`);
        process.env.DATABASE_URL = values.DATABASE_URL;
        if (!opts.internalKey && values.INTERNAL_API_KEY) opts.internalKey = values.INTERNAL_API_KEY;
        return;
    }
    require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env"), quiet: true });
    if (!opts.internalKey) opts.internalKey = process.env.LOADTEST_INTERNAL_KEY || "";
    if (!opts.frontendOrigin) opts.frontendOrigin = process.env.LOADTEST_FRONTEND_ORIGIN || "";
}

module.exports = { DEFAULTS, parseArgs, loadEnv, HELP };
