'use strict';

// 관리자 문의 답 파일, 한 트랜잭션(답 줄·답함·기록) → 커밋 뒤 플레이어 알림 저장·보내기
// inquiries.controller.js가 부름, 알림 모양은 플레이어 문의 쪽(services/inquiry/read.js)과 같은 것
const { createError } = require('../../../utils/appError');
const { isUniqueConstraintName } = require('../../../repositories/common');
const { AUDIT_ACTIONS } = require('../core/auditActions');
const inquiryRead = require('../../../services/inquiry/read');
const { notFound } = require('./list');

const defaultDeps = () => ({
    db: require('../../../repositories/common/db'),
    audit: require('../core/audit'),
    notifications: require('../../../services/notification'),
    now: () => new Date(),
});

const isoOf = (value) => (value ? new Date(value).toISOString() : null);

// 같은 요청 번호로 이미 단 답 → { reply, inquiry } / 없으면 null
const findByRequest = async (db, requestId) => {
    const reply = await db.InquiryReply.findOne({ where: { request_id: requestId } });
    if (!reply) return null;
    const inquiry = await db.Inquiry.findByPk(reply.inquiry_id);
    return { reply, inquiry };
};

// 답 줄·답함·기록을 한 번에 (문의 줄 잠금 → 동시에 둘이 답해도 차례로)
const writeReply = async ({ req, inquiryId, requestId, body }, deps) => deps.db.sequelize.transaction(async (transaction) => {
    const { db } = deps;
    const inquiry = await db.Inquiry.findOne({ where: { id: inquiryId }, transaction, lock: transaction.LOCK.UPDATE });
    if (!inquiry) throw notFound();
    const now = deps.now();
    const beforeStatus = inquiry.status;
    const reply = await db.InquiryReply.create({
        inquiry_id: inquiry.id, admin_id: req.admin.id, body, request_id: requestId, created_at: now,
    }, { transaction });
    // 처음 답한 시각을 남김 (두 번째 답부터는 그대로)
    const answeredAt = inquiry.answered_at ?? now;
    await inquiry.update({ status: inquiryRead.INQUIRY_STATUS.ANSWERED, answered_at: answeredAt, updated_at: now }, { transaction });
    await deps.audit.record({
        req,
        action: AUDIT_ACTIONS.INQUIRY_REPLY,
        targetType: 'inquiry',
        targetId: String(inquiry.id),
        before: { status: beforeStatus },
        after: { status: inquiryRead.INQUIRY_STATUS.ANSWERED, replyId: Number(reply.id), userUuid: inquiry.user_id, body },
        requestId,
    }, { transaction });
    return { reply, inquiry };
});

// 플레이어 알림 저장 + 접속 중이면 바로 보냄 → 알림이 저장돼 있으면 true
// 출처 키가 답마다 하나라 다시 불러도 알림은 하나 (실패해도 답은 남음 → false)
const notifyPlayer = async ({ reply, inquiry }, deps) => {
    try {
        const shape = inquiryRead.inquiryReplyNotification({ replyId: reply.id, inquiryId: inquiry.id, title: inquiry.title });
        const saved = await deps.notifications.createNotification({ userId: inquiry.user_id, ...shape });
        if (saved.created) deps.notifications.emitNotificationCreated(inquiry.user_id, saved.notification);
        return Boolean(saved.notification);
    } catch (error) {
        console.error('[ADMIN] 문의 답 알림 실패 —', error?.name ?? typeof error);
        return false;
    }
};

// 답 달기 → { reply, inquiry:{ id, status, answeredAt }, notified }
// 같은 요청 번호 두 번이면 처음 답 그대로 (답 줄 하나)
const replyToInquiry = async ({ req, inquiryId, requestId, body }, deps = defaultDeps()) => {
    let saved = await findByRequest(deps.db, requestId);
    if (!saved) {
        try {
            saved = await writeReply({ req, inquiryId, requestId, body }, deps);
        } catch (error) {
            // 같은 번호가 동시에 와서 먼저 들어간 쪽이 있으면 그 답
            if (!isUniqueConstraintName(error)) throw error;
            saved = await findByRequest(deps.db, requestId);
            if (!saved) throw error;
        }
    }
    if (String(saved.reply.inquiry_id) !== String(inquiryId)) {
        throw createError('이 요청 번호는 다른 문의에 이미 썼어요. 새로 고침한 뒤 다시 해 주세요.', 409, 'REQUEST_ID_REUSED');
    }
    const notified = await notifyPlayer(saved, deps);
    const admin = await deps.db.AdminUser.findByPk(saved.reply.admin_id, { attributes: ['login_id'] });
    return {
        reply: {
            id: Number(saved.reply.id),
            admin: { loginId: admin?.login_id ?? null },
            body: saved.reply.body,
            createdAt: isoOf(saved.reply.created_at),
        },
        inquiry: { id: Number(saved.inquiry.id), status: saved.inquiry.status, answeredAt: isoOf(saved.inquiry.answered_at) },
        notified,
    };
};

module.exports = { replyToInquiry };
