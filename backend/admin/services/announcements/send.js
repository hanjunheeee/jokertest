'use strict';

// 관리자 공지 보내기 파일, 기존 공지 서비스로 보내고 발송 결과를 관리자 기록(ANNOUNCE)에 남김
// announcements.controller.js가 부름, 공지 이력(1-4)은 이 기록의 after 값(제목·대상·결과 수)을 읽음
const { AUDIT_ACTIONS } = require('../core/auditActions');

// 기본 의존 (부를 때 읽음, 시험이 바꿔 끼움)
const defaultDeps = () => ({
    sendAnnouncement: require('../../../services/ops/announcements').sendAnnouncement,
    audit: require('../core/audit'),
});

// 보내기 → { result:{ recipientCount, created, duplicated, failed }, auditId }
// 요청 번호 = 공지 id → 같은 번호 두 번이면 기존 서비스가 알림을 다시 안 만듦(duplicated로 셈)
// 보낸 결과는 DB 밖 일이라 보낸 뒤 기록 한 줄 (두 번째 누름도 그 결과대로 한 줄)
const sendAdminAnnouncement = async ({ req, requestId, title, body, target, userUuids }, deps = defaultDeps()) => {
    const sent = await deps.sendAnnouncement({ announcementId: requestId, title, body, target, userUuids });
    const result = {
        recipientCount: sent.recipientCount,
        created: sent.created,
        duplicated: sent.duplicated,
        failed: sent.failed,
    };
    const selectedCount = target === 'users' ? new Set(userUuids).size : null;
    const { id } = await deps.audit.record({
        req,
        action: AUDIT_ACTIONS.ANNOUNCE,
        targetType: 'announcement',
        targetId: requestId,
        after: { title, body, target, selectedCount, ...result },
        requestId,
    });
    return { result, auditId: id };
};

module.exports = { sendAdminAnnouncement };
