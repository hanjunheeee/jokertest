'use strict';

// 신고 처리 서비스 파일, 처리(정지) · 기각 — OPEN일 때만 바꿈(조건 UPDATE)이라 둘이 동시에 눌러도 하나만
// reports.controller.js가 부름, 정지는 1-2 제재의 banMember(같은 트랜잭션)·disconnectAfterCommit(커밋 뒤) 그대로 씀
const { createError } = require('../../../utils/appError');
const audit = require('../core/audit');
const { AUDIT_ACTIONS } = require('../core/auditActions');
const { banMember, disconnectAfterCommit } = require('../sanctions/ban');
const { findReport } = require('./list');

const defaultDb = () => require('../../../repositories/common/db');

// 날짜 → UTC 글자 (raw 질의에 Date를 그대로 넘기면 서버 시간대 글자로 바뀌어 9시간 어긋남)
// 예: 2026-11-10T01:00:00.000Z → '2026-11-10 01:00:00.000'
const toUtcSqlText = (date) => date.toISOString().slice(0, 23).replace('T', ' ');

const notFound = () => createError('없는 신고예요. 목록을 새로 불러와 주세요.', 404, 'REPORT_NOT_FOUND');

// OPEN → 새 상태로 바꾸기 (트랜잭션 안), 바뀐 줄 0이면 없음 404 / 이미 처리됨 409 { handledBy, handledAt }
const claimReport = async ({ req, id, status }, { db, transaction }) => {
    const now = toUtcSqlText(new Date());
    const [, affected] = await db.sequelize.query(
        `UPDATE reports SET status = :status, handled_by_admin_id = :adminId, handled_at = :now
        WHERE id = :id AND status = 'OPEN'`,
        { replacements: { status, adminId: req.admin.id, now, id }, type: db.Sequelize.QueryTypes.UPDATE, transaction },
    );
    const report = await findReport(id, { db, transaction });
    if (!report) throw notFound();
    if (Number(affected) === 0) {
        const error = createError('다른 관리자가 이미 처리한 신고예요.', 409, 'REPORT_ALREADY_HANDLED');
        error.details = { handledBy: report.handledBy, handledAt: report.handledAt };
        throw error;
    }
    return report;
};

// 처리(정지) → { report, ban, disconnect }
// 정지가 실패하면(이미 정지 중 등) 트랜잭션째 되돌림 → 신고는 OPEN 그대로
const resolveReport = async ({ req, id, ban, memo }, { db = defaultDb(), disconnect } = {}) => {
    const done = await db.sequelize.transaction(async (transaction) => {
        const report = await claimReport({ req, id, status: 'RESOLVED' }, { db, transaction });
        const banned = await banMember({ req, uuid: report.target.uuid, ...ban }, { transaction, db });
        await audit.record({
            req, action: AUDIT_ACTIONS.REPORT_RESOLVE, targetType: 'report', targetId: id, reason: ban.reason,
            before: { status: 'OPEN' }, after: { status: 'RESOLVED', targetUuid: report.target.uuid, banId: banned.ban.id, memo: memo ?? null },
        }, { transaction, db });
        return { report, ban: banned.ban };
    });
    const result = await disconnectAfterCommit(done.report.target.uuid, disconnect ? { disconnect } : {});
    return { report: done.report, ban: done.ban, disconnect: result };
};

// 기각 → { report }
const dismissReport = async ({ req, id, memo }, { db = defaultDb() } = {}) => db.sequelize.transaction(async (transaction) => {
    const report = await claimReport({ req, id, status: 'DISMISSED' }, { db, transaction });
    await audit.record({
        req, action: AUDIT_ACTIONS.REPORT_DISMISS, targetType: 'report', targetId: id, reason: memo ?? null,
        before: { status: 'OPEN' }, after: { status: 'DISMISSED', targetUuid: report.target.uuid },
    }, { transaction, db });
    return { report };
});

module.exports = { resolveReport, dismissReport };
