'use strict';

// 관리자 문의 읽기 파일, 상태별 목록(50줄씩) + 문의 하나(쓴 사람·답 전부)
// inquiries.controller.js가 부름, 조회는 관리자 조회 줄(queryQueue) 안에서 시간 제한 붙여 읽기만
const { QueryTypes } = require('sequelize');
const { createError } = require('../../../utils/appError');
const queryQueue = require('../core/queryQueue');

const defaultDeps = () => ({ db: require('../../../repositories/common/db'), queue: queryQueue });

const notFound = () => createError('문의를 찾을 수 없어요. 목록에서 다시 골라 주세요.', 404, 'INQUIRY_NOT_FOUND');
const isoOf = (value) => (value ? new Date(value).toISOString() : null);

const select = (db, sql, replacements) => db.sequelize.query(queryQueue.withTimeoutHint(sql), { replacements, type: QueryTypes.SELECT });

// id 묶음 → 이름표 (표끼리 문자 정렬 규칙이 달라도 안 걸리게 따로 읽음)
// 예) ['u1'] → Map { 'u1' → '조커왕' }
const namesOf = async (db, sql, ids) => {
    if (ids.length === 0) return new Map();
    const rows = await select(db, sql, { ids });
    return new Map(rows.map((row) => [row.id, row.name]));
};
const nicknamesOf = (db, ids) => namesOf(db, 'SELECT uuid AS id, nickname AS name FROM users WHERE uuid IN (:ids)', ids);

const toItem = (row, nicknames) => ({
    id: Number(row.id),
    user: { uuid: row.user_id, nickname: nicknames.get(row.user_id) ?? null },
    category: row.category,
    title: row.title,
    status: row.status,
    createdAt: isoOf(row.created_at),
    answeredAt: isoOf(row.answered_at),
    replyCount: Number(row.reply_count ?? 0),
});

// 목록 → { items, nextBefore } (최근 것 먼저, nextBefore null이면 끝)
const listInquiries = async ({ status, before, limit }, deps = defaultDeps()) => deps.queue.run(async () => {
    const { db } = deps;
    const parts = [];
    if (status) parts.push('i.status = :status');
    if (before) parts.push('i.id < :before');
    const where = parts.length ? `WHERE ${parts.join(' AND ')}` : '';
    const rows = await select(db, `SELECT i.id, i.user_id, i.category, i.title, i.status, i.created_at, i.answered_at,
            (SELECT COUNT(*) FROM inquiry_replies r WHERE r.inquiry_id = i.id) AS reply_count
        FROM inquiries i ${where} ORDER BY i.id DESC LIMIT :take`, { status, before, take: limit + 1 });
    const page = rows.slice(0, limit);
    const nicknames = await nicknamesOf(db, [...new Set(page.map((row) => row.user_id))]);
    return {
        items: page.map((row) => toItem(row, nicknames)),
        nextBefore: rows.length > limit ? Number(page[page.length - 1].id) : null,
    };
});

// 문의 하나 → { inquiry, user, replies } (답은 오래된 것 먼저, 답 단 관리자 아이디까지)
const getInquiry = async (id, deps = defaultDeps()) => deps.queue.run(async () => {
    const { db } = deps;
    const [row] = await select(db, `SELECT id, user_id, category, title, body, status, created_at, answered_at
        FROM inquiries WHERE id = :id`, { id });
    if (!row) throw notFound();
    const replies = await select(db, `SELECT id, admin_id, body, created_at FROM inquiry_replies
        WHERE inquiry_id = :id ORDER BY created_at ASC, id ASC`, { id });
    const nicknames = await nicknamesOf(db, [row.user_id]);
    const loginIds = await namesOf(db, 'SELECT id, login_id AS name FROM admin_users WHERE id IN (:ids)', [...new Set(replies.map((r) => r.admin_id))]);
    return {
        inquiry: {
            id: Number(row.id),
            category: row.category,
            title: row.title,
            body: row.body,
            status: row.status,
            createdAt: isoOf(row.created_at),
            answeredAt: isoOf(row.answered_at),
        },
        user: { uuid: row.user_id, nickname: nicknames.get(row.user_id) ?? null },
        replies: replies.map((reply) => ({
            id: Number(reply.id),
            admin: { loginId: loginIds.get(reply.admin_id) ?? null },
            body: reply.body,
            createdAt: isoOf(reply.created_at),
        })),
    };
});

module.exports = { listInquiries, getInquiry, notFound };
