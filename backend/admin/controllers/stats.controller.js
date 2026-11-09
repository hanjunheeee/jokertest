'use strict';

// 통계 경로 처리 파일, GET /admin-api/stats?from=&to= → 주소 칸 검사 → 통계 서비스 → { ok:true, days }
// stats.routes.js가 붙임, 응답 모양은 경계.md 2-10
const { createError } = require('../../utils/appError');
const daily = require('../services/stats/daily');

const QUERY_FIELDS = new Set(['from', 'to']);

// 모르는 칸 → 400 INVALID_INPUT, 날짜 모양·기간은 서비스(kstRange)가 INVALID_RANGE로 봄
const readQuery = (query) => {
    const unknown = Object.keys(query ?? {}).find((key) => !QUERY_FIELDS.has(key));
    if (unknown) {
        const error = createError('입력한 값을 다시 확인해 주세요.', 400, 'INVALID_INPUT');
        error.details = { field: unknown };
        throw error;
    }
    return { from: typeof query.from === 'string' ? query.from : '', to: typeof query.to === 'string' ? query.to : '' };
};

exports.getStats = async (req, res) => {
    res.json({ ok: true, ...(await daily.getDailyStats(readQuery(req.query))) });
};
