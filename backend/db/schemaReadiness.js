'use strict';

// 시작 전 DB 표 준비 확인 파일, 마이그레이션 이력으로 표가 다 만들어졌는지 봄 (표를 만들지는 않음)
// index.js가 포트 열기 전에 부름: 운영은 안 됐으면 시작 거부, 개발·시험은 경고만
const migrationRunner = require('./migrationRunner');

// 시작 거부 오류 표시 (DB 연결 실패와 문구 나누기)
const SCHEMA_NOT_READY = 'SCHEMA_NOT_READY';

// 마이그레이션 목록은 명령 파일 하나에만 둠 (main은 직접 실행 때만 돎)
const loadMigrations = () => require('../scripts/migrate-db').MIGRATIONS;

// 상태 줄 → 안 된 것 세 갈래 (안 돌림 · 실패·멈춤 · 파일 바뀜)
const summarize = (rows) => {
    const pending = rows.filter((row) => row.status === 'pending').map((row) => row.name);
    const broken = rows.filter((row) => row.status === 'failed' || row.status === 'running').map((row) => row.name);
    const changed = rows.filter((row) => row.status === 'applied' && row.checksumMatches === false).map((row) => row.name);
    return { ready: pending.length + broken.length + changed.length === 0, pending, broken, changed };
};

// 사람이 읽을 한 줄 (무엇이 안 됐는지 + 할 일)
const describeProblems = ({ pending, broken, changed }) => {
    const parts = [];
    if (pending.length > 0) parts.push(`안 돌린 마이그레이션 ${pending.length}개 [${pending.join(', ')}]`);
    if (broken.length > 0) parts.push(`실패·멈춘 마이그레이션 [${broken.join(', ')}]`);
    if (changed.length > 0) parts.push(`적용 뒤 파일이 바뀐 마이그레이션 [${changed.join(', ')}]`);
    return `${parts.join(' / ')} — 먼저 node -r dotenv/config scripts/migrate-db.js status 로 확인하고 migrate 돌리기`;
};

// 연결 확인 → 이력 대조 → 운영이면 거부, 아니면 경고만 (돌려준 값은 시험용)
const ensureSchemaReady = async (sequelize, {
    env = process.env.NODE_ENV,
    migrations = loadMigrations(),
    warn = (message) => console.warn(message),
} = {}) => {
    await sequelize.authenticate();
    const rows = await migrationRunner.getStatus({ sequelize, migrations });
    const summary = summarize(rows);
    if (summary.ready) return summary;

    const message = describeProblems(summary);
    if (env === 'production') {
        const error = new Error(message);
        error.code = SCHEMA_NOT_READY;
        throw error;
    }
    warn(`[STARTUP] 경고 — DB 표 준비 안 됨: ${message} (개발이라 계속 켬, 표 없는 기능은 오류 남)`);
    return summary;
};

module.exports = {
    SCHEMA_NOT_READY,
    summarize,
    describeProblems,
    ensureSchemaReady,
};
