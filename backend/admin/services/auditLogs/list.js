'use strict';

// 처리 이력 읽기 파일, 관리자 기록을 칸(전체·공지 발송·제재·해제)·회원·관리자·기간으로 걸러 50줄씩 + 관리자 목록
// auditLogs.controller.js가 부름, 조회는 관리자 조회 줄(queryQueue) 안에서 시간 제한 붙여 읽기만
const { QueryTypes } = require('sequelize');
const queryQueue = require('../core/queryQueue');
const { AUDIT_KINDS } = require('../core/auditActions');

const defaultDeps = () => ({ db: require('../../../repositories/common/db'), queue: queryQueue });

// 회원 대상 줄의 target_type (제재·강제 종료·이메일 보기는 'member', 주고 뺏기는 'user'로 남김 → 둘 다 회원 uuid가 target_id)
const MEMBER_TARGETS = Object.freeze(['member', 'user']);
// 신고 처리 줄은 대상이 신고 번호라 회원 uuid는 after.targetUuid에 있음
const REPORT_TARGET = 'report';

// Date → DB 시각 글자 UTC (원문 SQL 넣기는 Date를 이 컴퓨터 시각으로 바꿔 넣어서 직접 맞춤)
// 예) 2026-11-10T03:00:00.000Z → '2026-11-10 03:00:00.000'
const toDbTime = (date) => date.toISOString().replace('T', ' ').replace('Z', '');

const parseJson = (value) => {
    if (typeof value !== 'string') return value ?? null;
    try { return JSON.parse(value); } catch { return value; }
};

// 거르기 → WHERE 조각들 + 넣을 값
// 예) { kind:'sanction', memberUuid:'u1' } → 'WHERE action IN (:actions) AND ((target_type IN (:memberTargets) AND target_id = :memberUuid) OR …)'
const whereOf = ({ kind, memberUuid, adminId, from, to, before }) => {
    const parts = [];
    const values = {};
    if (kind && kind !== 'all') {
        parts.push('action IN (:actions)');
        values.actions = [...AUDIT_KINDS[kind]];
    }
    if (memberUuid) {
        parts.push(`((target_type IN (:memberTargets) AND target_id = :memberUuid)
            OR (target_type = :reportTarget AND JSON_UNQUOTE(JSON_EXTRACT(after_value, '$.targetUuid')) = :memberUuid))`);
        Object.assign(values, { memberTargets: [...MEMBER_TARGETS], reportTarget: REPORT_TARGET, memberUuid });
    }
    if (adminId) { parts.push('admin_id = :adminId'); values.adminId = adminId; }
    if (from) { parts.push('created_at >= :from'); values.from = toDbTime(from); }
    if (to) { parts.push('created_at < :to'); values.to = toDbTime(to); }
    if (before) { parts.push('id < :before'); values.before = before; }
    return { sql: parts.length ? `WHERE ${parts.join(' AND ')}` : '', values };
};

// 줄에 나온 관리자 id·회원 uuid → 이름표 (표끼리 문자 정렬 규칙이 달라도 안 걸리게 따로 읽음)
// 예) ['a1'] → Map { 'a1' → 'ceo' }
const namesOf = async (db, sql, ids) => {
    if (ids.length === 0) return new Map();
    const rows = await db.sequelize.query(queryQueue.withTimeoutHint(sql), { replacements: { ids }, type: QueryTypes.SELECT });
    return new Map(rows.map((row) => [row.id, row.name]));
};

// 줄 → 대상 회원 uuid (회원 줄은 target_id, 신고 줄은 after.targetUuid, 그 밖은 null)
const memberUuidOf = (row) => {
    if (MEMBER_TARGETS.includes(row.target_type)) return row.target_id;
    if (row.target_type === REPORT_TARGET) return parseJson(row.after_value)?.targetUuid ?? null;
    return null;
};

const toItem = (row, adminNames, memberNames) => ({
    id: Number(row.id),
    admin: { id: row.admin_id, loginId: adminNames.get(row.admin_id) ?? null },
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    target: memberNames.has(memberUuidOf(row)) ? { uuid: memberUuidOf(row), nickname: memberNames.get(memberUuidOf(row)) } : null,
    before: parseJson(row.before_value),
    after: parseJson(row.after_value),
    reason: row.reason,
    ip: row.ip,
    accessEmail: row.access_email,
    createdAt: new Date(row.created_at).toISOString(),
});

// 이력 목록 → { items, nextBefore } (nextBefore null이면 끝)
const listAuditLogs = async (filters, deps = defaultDeps()) => deps.queue.run(async () => {
    const { db } = deps;
    const { sql, values } = whereOf(filters);
    const rows = await db.sequelize.query(
        queryQueue.withTimeoutHint(`SELECT id, admin_id, action, target_type, target_id, before_value, after_value, reason, ip, access_email, created_at
            FROM admin_audit_logs ${sql} ORDER BY id DESC LIMIT :take`),
        { replacements: { ...values, take: filters.limit + 1 }, type: QueryTypes.SELECT },
    );
    const page = rows.slice(0, filters.limit);
    const adminIds = [...new Set(page.map((row) => row.admin_id))];
    const memberIds = [...new Set(page.map(memberUuidOf).filter(Boolean))];
    const adminNames = await namesOf(db, 'SELECT id, login_id AS name FROM admin_users WHERE id IN (:ids)', adminIds);
    const memberNames = await namesOf(db, 'SELECT uuid AS id, nickname AS name FROM users WHERE uuid IN (:ids)', memberIds);
    return {
        items: page.map((row) => toItem(row, adminNames, memberNames)),
        nextBefore: rows.length > filters.limit ? Number(page[page.length - 1].id) : null,
    };
});

// 관리자 목록 (누가 거르기용) → { items:[{ id, loginId }] }
const listAdmins = async (deps = defaultDeps()) => deps.queue.run(async () => {
    const rows = await deps.db.sequelize.query(
        queryQueue.withTimeoutHint('SELECT id, login_id FROM admin_users ORDER BY login_id ASC LIMIT 200'),
        { type: QueryTypes.SELECT },
    );
    return { items: rows.map((row) => ({ id: row.id, loginId: row.login_id })) };
});

module.exports = { listAuditLogs, listAdmins, MEMBER_TARGETS };
