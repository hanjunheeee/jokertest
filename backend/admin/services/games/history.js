'use strict';

// 지난 판 결과 서비스 파일, 판 찾기(회원·한국 날짜·커서 50줄) + 판 하나 참가자·직업·승패·시간
// games.controller.js가 부름, 읽기만 (game_results·game_result_players)
const { QueryTypes } = require('sequelize');
const { createError } = require('../../../utils/appError');
const queryQueue = require('../core/queryQueue');
const { kstDayStart, toSqlUtc } = require('../stats/daily');

const defaultDb = () => require('../../../repositories/common/db');

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_LIMIT = 50;

const invalid = (field) => {
    const error = createError('입력한 값을 다시 확인해 주세요.', 400, 'INVALID_INPUT');
    error.details = { field };
    return error;
};

const notFound = () => createError('그 판을 찾지 못했어요. 판 번호를 다시 확인해 주세요.', 404, 'GAME_NOT_FOUND');

const toIso = (value) => (value ? new Date(value).toISOString() : null);

const select = (db, sql, replacements) => db.sequelize.query(queryQueue.withTimeoutHint(sql), {
    replacements,
    type: QueryTypes.SELECT,
});

// 목록 한 줄 (DB 칸 → 약속 이름)
const toListItem = (row) => ({
    gameId: row.id,
    startedAt: toIso(row.started_at),
    endedAt: toIso(row.ended_at),
    winner: row.winner,
    winReason: row.win_reason ?? null,
    playerCount: Number(row.player_count),
    dayIndex: Number(row.day_index),
});

// 찾기 조건 → WHERE 조각들 + 값 (한국 날짜 from 0시 ~ to 다음날 0시, 커서는 끝난 시각·id 순)
const buildFilters = async (db, { userUuid, from, to, before }) => {
    const where = [];
    const values = {};
    if (from) {
        where.push('g.ended_at >= :from');
        values.from = toSqlUtc(kstDayStart(from));
    }
    if (to) {
        where.push('g.ended_at < :to');
        values.to = toSqlUtc(kstDayStart(to) + DAY_MS);
    }
    if (before) {
        const [cursor] = await select(db, 'SELECT id FROM game_results WHERE id = :before', { before });
        if (!cursor) throw invalid('before');
        // 커서 판의 끝난 시각은 DB 안에서 바로 비교 (시각을 JS로 꺼냈다 넣으면 시간대가 어긋날 수 있음)
        const cursorAt = '(SELECT c.ended_at FROM game_results c WHERE c.id = :before)';
        where.push(`(g.ended_at < ${cursorAt} OR (g.ended_at = ${cursorAt} AND g.id < :before))`);
        values.before = before;
    }
    // 회원이 있으면 참가자 표(user_id 인덱스)로 묶음
    const join = userUuid ? 'JOIN game_result_players p ON p.game_id = g.id AND p.user_id = :userUuid' : '';
    if (userUuid) values.userUuid = userUuid;
    return { join, where: where.length ? `WHERE ${where.join(' AND ')}` : '', values };
};

// 판 찾기 → { items, nextBefore } (늦게 끝난 판부터, nextBefore = 마지막 줄 gameId · 끝이면 null)
const listGames = async ({ userUuid, from, to, before, limit = MAX_LIMIT } = {}, { db = defaultDb(), queue = queryQueue } = {}) => (
    queue.run(async () => {
        const filters = await buildFilters(db, { userUuid, from, to, before });
        const rows = await select(db, `SELECT g.id, g.started_at, g.ended_at, g.winner, g.win_reason, g.player_count, g.day_index
            FROM game_results g ${filters.join} ${filters.where}
            ORDER BY g.ended_at DESC, g.id DESC LIMIT :take`, { ...filters.values, take: limit + 1 });
        const items = rows.slice(0, limit).map(toListItem);
        return { items, nextBefore: rows.length > limit ? items[items.length - 1].gameId : null };
    })
);

// 참가자 한 줄
const toPlayer = (row) => ({
    uuid: row.user_id,
    nickname: row.nickname_snapshot,
    role: row.role,
    team: row.team,
    won: row.won === null || row.won === undefined ? null : Boolean(row.won),
    alive: Boolean(row.is_alive),
    deathReason: row.death_reason ?? null,
});

// 판 하나 → { game, players } (판 시간은 초로도), 없으면 404 GAME_NOT_FOUND
const getGame = async (gameId, { db = defaultDb(), queue = queryQueue } = {}) => (
    queue.run(async () => {
        const [row] = await select(db, `SELECT id, room_id, started_at, ended_at, winner, win_reason, player_count, day_index, completed
            FROM game_results WHERE id = :gameId`, { gameId });
        if (!row) throw notFound();
        const players = await select(db, `SELECT user_id, nickname_snapshot, role, team, won, is_alive, death_reason
            FROM game_result_players WHERE game_id = :gameId ORDER BY team, nickname_snapshot`, { gameId });
        const game = {
            ...toListItem(row),
            roomId: row.room_id ?? null,
            completed: Boolean(row.completed),
            durationSec: Math.max(0, Math.round((new Date(row.ended_at) - new Date(row.started_at)) / 1000)),
        };
        return { game, players: players.map(toPlayer) };
    })
);

module.exports = { MAX_LIMIT, listGames, getGame, notFound };
