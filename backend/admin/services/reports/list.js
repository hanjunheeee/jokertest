'use strict';

// 신고 보기 서비스 파일, 신고 목록(상태별 50줄) · 신고 상세(채팅 증거 + 대상 지난 정지·받은 신고 수, 증거 보기 기록)
// reports.controller.js가 부름, 처리(정지·기각)는 handle.js
const { createError } = require('../../../utils/appError');
const audit = require('../core/audit');
const { AUDIT_ACTIONS } = require('../core/auditActions');
const queryQueue = require('../core/queryQueue');

const defaultDb = () => require('../../../repositories/common/db');

const isoOf = (value) => (value ? new Date(value).toISOString() : null);

// 신고 + 신고자·대상 닉네임 + 처리한 관리자 아이디 (탈퇴한 사람도 보이게 users를 그냥 붙임)
const REPORT_SELECT = `SELECT r.id, r.reporter_id, rp.nickname AS reporter_nickname, r.target_id, tg.nickname AS target_nickname,
    r.game_id, r.reason_code, r.memo, r.status, r.created_at, r.handled_at, a.login_id AS handled_by
    FROM reports r
    LEFT JOIN users rp ON rp.uuid = r.reporter_id
    LEFT JOIN users tg ON tg.uuid = r.target_id
    LEFT JOIN admin_users a ON a.id = r.handled_by_admin_id`;

// 표 줄 → 화면 모양 (예: { reporter_id:'u1', reporter_nickname:'가면1', … } → { reporter:{ uuid:'u1', nickname:'가면1' }, … })
const toReport = (row) => ({
    id: Number(row.id),
    reporter: { uuid: row.reporter_id, nickname: row.reporter_nickname ?? null },
    target: { uuid: row.target_id, nickname: row.target_nickname ?? null },
    gameId: row.game_id,
    reasonCode: row.reason_code,
    memo: row.memo ?? null,
    status: row.status,
    createdAt: isoOf(row.created_at),
    handledAt: isoOf(row.handled_at),
    handledBy: row.handled_by ?? null,
});

const select = (db, sql, replacements) => queryQueue.run(() => db.sequelize.query(queryQueue.withTimeoutHint(sql), {
    replacements, type: db.Sequelize.QueryTypes.SELECT,
}));

// 목록: 새 신고부터, status 있으면 그 상태만 → { items, nextBefore }
const listReports = async ({ status, before, limit = 50 }, { db = defaultDb() } = {}) => {
    const where = [];
    const replacements = { limit: limit + 1 };
    if (status) { where.push('r.status = :status'); replacements.status = status; }
    if (before) { where.push('r.id < :before'); replacements.before = before; }
    const rows = await select(db, `${REPORT_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY r.id DESC LIMIT :limit`, replacements);
    const items = rows.slice(0, limit).map(toReport);
    return { items, nextBefore: rows.length > limit ? items[items.length - 1].id : null };
};

// 신고 하나 (트랜잭션 안에서도 씀) → 없으면 null
const findReport = async (id, { db = defaultDb(), transaction } = {}) => {
    const [row] = await db.sequelize.query(`${REPORT_SELECT} WHERE r.id = :id`, {
        replacements: { id }, type: db.Sequelize.QueryTypes.SELECT, transaction,
    });
    return row ? toReport(row) : null;
};

// JSON 칸이 글자로 올 때도 있어 풀어 줌
const parseMessages = (value) => {
    const list = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(list) ? list : [];
};

// 증거 줄 → { savedAt, messages } (시각순, 칸 이름 고정), 없으면 null
// 예: [{ at:'…02', text:'b' }, { at:'…01', text:'a' }] → messages [a, b]
const toEvidence = (row) => {
    if (!row) return null;
    const messages = parseMessages(row.messages)
        .map((m) => ({ at: m.at ?? null, channel: m.channel ?? null, senderUuid: m.senderUuid ?? null, nickname: m.nickname ?? null, text: m.text ?? '' }))
        .sort((a, b) => String(a.at).localeCompare(String(b.at)));
    return { savedAt: isoOf(row.saved_at), messages };
};

// 대상의 지난 정지 + 받은 신고 수
const targetHistoryOf = async (db, uuid) => {
    const now = new Date();
    const bans = await select(db, `SELECT id, reason, is_permanent, start_at, end_at, lifted_at FROM user_bans
        WHERE user_id = :uuid ORDER BY id DESC LIMIT 20`, { uuid });
    const [{ count }] = await select(db, 'SELECT COUNT(*) AS count FROM reports WHERE target_id = :uuid', { uuid });
    return {
        bans: bans.map((ban) => ({
            id: Number(ban.id),
            reason: ban.reason ?? null,
            isPermanent: Boolean(ban.is_permanent),
            startAt: isoOf(ban.start_at),
            endAt: isoOf(ban.end_at),
            liftedAt: isoOf(ban.lifted_at),
            active: Boolean(!ban.lifted_at && (ban.is_permanent || (ban.end_at && new Date(ban.end_at) > now))),
        })),
        reportCount: Number(count),
    };
};

// 상세 → { report, evidence, targetHistory } + 증거 보기 기록 (채팅 원문은 개인정보라 볼 때마다 남김)
const getReport = async ({ req, id }, { db = defaultDb() } = {}) => {
    const report = await queryQueue.run(() => findReport(id, { db }));
    if (!report) throw createError('없는 신고예요. 목록을 새로 불러와 주세요.', 404, 'REPORT_NOT_FOUND');
    const [evidenceRow] = await select(db, `SELECT messages, saved_at FROM report_chat_evidence
        WHERE report_id = :id ORDER BY id DESC LIMIT 1`, { id });
    const evidence = toEvidence(evidenceRow);
    const targetHistory = await targetHistoryOf(db, report.target.uuid);
    await audit.record({
        req, action: AUDIT_ACTIONS.VIEW_EVIDENCE, targetType: 'report', targetId: id,
        after: { hasEvidence: Boolean(evidence), messageCount: evidence ? evidence.messages.length : 0 },
    }, { db });
    return { report, evidence, targetHistory };
};

module.exports = { listReports, getReport, findReport, toEvidence };
