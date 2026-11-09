'use strict';

// 통계 서비스 파일, 한국 날짜별 가입 수·최고 접속(Node 합)·판 수·매출·환불 금액 모으기 + 한국 날짜 셈
// stats.controller.js가 부름, 한국 날짜 셈(kstDay·kstRange)은 지난 판 찾기(games/history.js)도 씀
const { QueryTypes } = require('sequelize');
const { createError } = require('../../../utils/appError');
const queryQueue = require('../core/queryQueue');

const defaultDb = () => require('../../../repositories/common/db');

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_DAYS = 92;
// 통계는 다른 관리자 조회(3초)보다 조금 길게
const STATS_LIMIT_MS = 5000;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
// UTC 시각 칸 → 한국 날짜 글자 (예: 2026-11-09 15:30 UTC → '2026-11-10')
const KST_DAY_SQL = (column) => `DATE_FORMAT(DATE_ADD(${column}, INTERVAL 9 HOUR), '%Y-%m-%d')`;

const invalidRange = (field) => {
    const error = createError('기간을 다시 골라 주세요. (하루~92일, 시작이 끝보다 앞)', 400, 'INVALID_RANGE');
    error.details = { field };
    return error;
};

// 한국 날짜 글자 → 그날 0시(한국)의 UTC 밀리초, 없는 날짜(2월 30일 등)·모양 틀림 → null
// 예: '2026-11-10' → Date.UTC(2026,10,10) - 9시간 = 2026-11-09T15:00:00Z
const kstDayStart = (text) => {
    const match = DATE_PATTERN.exec(String(text ?? ''));
    if (!match) return null;
    const [, year, month, day] = match.map(Number);
    const utcMidnight = Date.UTC(year, month - 1, day);
    const check = new Date(utcMidnight);
    if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
    return utcMidnight - KST_OFFSET_MS;
};

// 시각 → SQL에 넣을 UTC 글자 (예: 2026-11-09T15:00:00.000Z → '2026-11-09 15:00:00')
// Date를 그대로 넣으면 날 SQL 값 바꿀 때 서버 컴퓨터 시간대로 바뀜(한국 PC면 9시간 밀림) → 글자로 넣음
const toSqlUtc = (date) => new Date(date).toISOString().slice(0, 19).replace('T', ' ');

// 시각 → 한국 날짜 글자 (예: 2026-11-09T15:00:00Z → '2026-11-10')
const kstDay = (date) => new Date(new Date(date).getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);

// 한국 날짜 from~to(둘 다 포함) → { start, end(다음날 0시, 안 포함), dates:[날짜 글자] }
// maxDays 넘음·거꾸로·없는 날짜 → 400 INVALID_RANGE
const kstRange = (from, to, { maxDays = MAX_DAYS } = {}) => {
    const startMs = kstDayStart(from);
    if (startMs === null) throw invalidRange('from');
    const lastMs = kstDayStart(to);
    if (lastMs === null) throw invalidRange('to');
    if (lastMs < startMs) throw invalidRange('to');
    const dayCount = Math.round((lastMs - startMs) / DAY_MS) + 1;
    if (dayCount > maxDays) throw invalidRange('to');
    // [0,1,2] → ['2026-11-01','2026-11-02','2026-11-03']
    const dates = Array.from({ length: dayCount }, (_, index) => kstDay(startMs + index * DAY_MS));
    return { start: new Date(startMs), end: new Date(lastMs + DAY_MS), dates };
};

// 날짜별 숫자 SQL 다섯 개 (전부 기간 인덱스 칸으로 거름: users·game_results·economy_topup_orders는 0025, 접속은 captured_at)
const DAILY_QUERIES = Object.freeze({
    signups: `SELECT ${KST_DAY_SQL('created_at')} AS day, COUNT(*) AS value FROM users
        WHERE created_at >= :start AND created_at < :end GROUP BY day`,
    // 분마다 Node별 최고 → 분마다 Node 합 → 날마다 최고
    peakOnline: `SELECT ${KST_DAY_SQL('minute_at')} AS day, MAX(node_sum) AS value FROM (
            SELECT minute_at, SUM(node_peak) AS node_sum FROM (
                SELECT DATE_FORMAT(captured_at, '%Y-%m-%d %H:%i:00') AS minute_at, COALESCE(server_id, '') AS node, MAX(total) AS node_peak
                FROM concurrent_snapshots WHERE captured_at >= :start AND captured_at < :end
                GROUP BY minute_at, node
            ) AS per_node GROUP BY minute_at
        ) AS per_minute GROUP BY day`,
    games: `SELECT ${KST_DAY_SQL('ended_at')} AS day, COUNT(*) AS value FROM game_results
        WHERE ended_at >= :start AND ended_at < :end GROUP BY day`,
    // 매출 = 지급된 주문만 (환불된 주문은 REFUNDED라 빠짐), 날짜는 주문 만든 날
    revenueKrw: `SELECT ${KST_DAY_SQL('created_at')} AS day, SUM(pay_amount) AS value FROM economy_topup_orders
        WHERE created_at >= :start AND created_at < :end AND status = 'GRANTED' GROUP BY day`,
    refundsKrw: `SELECT ${KST_DAY_SQL('created_at')} AS day, SUM(pay_amount) AS value FROM economy_topup_orders
        WHERE created_at >= :start AND created_at < :end AND status = 'REFUNDED' GROUP BY day`,
});

// 칸 하나 읽기 → Map(날짜 → 숫자), 예: [{ day:'2026-11-10', value:'3' }] → Map { '2026-11-10' → 3 }
const readColumn = async (sql, range, db) => {
    const rows = await db.sequelize.query(queryQueue.withTimeoutHint(sql, STATS_LIMIT_MS), {
        replacements: { start: toSqlUtc(range.start), end: toSqlUtc(range.end) },
        type: QueryTypes.SELECT,
    });
    return new Map(rows.map((row) => [String(row.day), Number(row.value) || 0]));
};

// 날짜마다 다섯 칸, 없는 날은 0
const fillDays = (dates, columns) => dates.map((date) => ({
    date,
    signups: columns.signups.get(date) ?? 0,
    peakOnline: columns.peakOnline.get(date) ?? 0,
    games: columns.games.get(date) ?? 0,
    revenueKrw: columns.revenueKrw.get(date) ?? 0,
    refundsKrw: columns.refundsKrw.get(date) ?? 0,
}));

// GET /admin-api/stats 몸통: 관리자 조회 줄에서 SQL 다섯 개를 차례로
const getDailyStats = async ({ from, to }, { db = defaultDb(), queue = queryQueue } = {}) => {
    const range = kstRange(from, to);
    const columns = await queue.run(async () => {
        const read = {};
        for (const [name, sql] of Object.entries(DAILY_QUERIES)) read[name] = await readColumn(sql, range, db);
        return read;
    });
    return { days: fillDays(range.dates, columns) };
};

module.exports = {
    MAX_DAYS,
    STATS_LIMIT_MS,
    DAILY_QUERIES,
    kstDayStart,
    toSqlUtc,
    kstDay,
    kstRange,
    fillDays,
    getDailyStats,
};
