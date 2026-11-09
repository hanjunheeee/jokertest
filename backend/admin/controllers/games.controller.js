'use strict';

// 지난 판 경로 처리 파일, 주소 칸 검사 → 지난 판 서비스 → 응답 (목록 · 판 하나)
// games.routes.js가 붙임, 응답 모양은 경계.md 2-11
const { createError } = require('../../utils/appError');
const history = require('../services/games/history');
const { kstDayStart } = require('../services/stats/daily');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (value) => typeof value === 'string' && UUID_PATTERN.test(value);
const isKstDate = (value) => typeof value === 'string' && kstDayStart(value) !== null;

// 칸 이름 → 맞는 값인지 (빈 칸은 안 거름)
const LIST_FIELDS = Object.freeze({
    userUuid: isUuid,
    from: isKstDate,
    to: isKstDate,
    before: isUuid,
    limit: (value) => /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= history.MAX_LIMIT,
});

const invalid = (field) => {
    const error = createError('입력한 값을 다시 확인해 주세요.', 400, 'INVALID_INPUT');
    error.details = { field };
    return error;
};

// 모르는 칸·모양 틀림 → 400 { field }, 날짜 거꾸로 → to
const readListQuery = (query = {}) => {
    const input = {};
    for (const [key, value] of Object.entries(query)) {
        if (!Object.hasOwn(LIST_FIELDS, key)) throw invalid(key);
        if (value === '') continue;
        if (typeof value !== 'string' || !LIST_FIELDS[key](value)) throw invalid(key);
        input[key] = key === 'limit' ? Number(value) : value;
    }
    if (input.from && input.to && kstDayStart(input.to) < kstDayStart(input.from)) throw invalid('to');
    return input;
};

// GET /admin-api/games → { ok, items, nextBefore }
exports.listGames = async (req, res) => {
    res.json({ ok: true, ...(await history.listGames(readListQuery(req.query))) });
};

// GET /admin-api/games/:gameId → { ok, game, players } (판 번호 모양이 틀려도 없는 판과 같게 404)
exports.getGame = async (req, res) => {
    if (!isUuid(req.params.gameId)) throw history.notFound();
    res.json({ ok: true, ...(await history.getGame(req.params.gameId)) });
};
