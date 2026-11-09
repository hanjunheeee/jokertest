'use strict';

// 플레이어 문의 읽기 파일, 내 문의 목록·상세 + 화면에 보이는 모양(답은 "운영팀", 답 알림 모양)
// controllers/inquiry.controller.js가 부름, 상태 값·알림 모양은 관리자 문의 답(admin/services/inquiries)도 씀
const { createError } = require('../../utils/appError');

// OPEN(답 기다림) → ANSWERED(답함)
const INQUIRY_STATUS = Object.freeze({ OPEN: 'OPEN', ANSWERED: 'ANSWERED' });
// 플레이어에겐 관리자 아이디 대신 이 이름
const INQUIRY_REPLY_FROM = '운영팀';
// 내 목록은 최근 50개까지
const MY_LIST_LIMIT = 50;

const defaultDeps = () => ({ db: require('../../repositories/common/db') });

// 문의 오류 (컨트롤러가 code 보고 { ok:false, code, message }로 응답)
const inquiryError = (message, status, code) => createError(message, status, code);
const notFound = () => inquiryError('문의를 찾을 수 없어요.', 404, 'INQUIRY_NOT_FOUND');

const plainOf = (row) => (row && typeof row.get === 'function' ? row.get({ plain: true }) : row);
const isoOf = (value) => (value ? new Date(value).toISOString() : null);

// 목록 한 줄 모양 (본문 뺌)
const listItemOf = (row) => {
    const plain = plainOf(row);
    return {
        id: Number(plain.id),
        category: plain.category,
        title: plain.title,
        status: plain.status,
        createdAt: isoOf(plain.created_at),
        answeredAt: isoOf(plain.answered_at),
    };
};

// 답 한 줄 모양 (관리자 id 안 보임)
const replyOf = (row) => {
    const plain = plainOf(row);
    return { id: Number(plain.id), body: plain.body, createdAt: isoOf(plain.created_at), from: INQUIRY_REPLY_FROM };
};

// 상세 모양 = 목록 칸 + 본문 + 답 (오래된 답 먼저)
const inquiryView = (row, replies = []) => ({ ...listItemOf(row), body: plainOf(row).body, replies: replies.map(replyOf) });

// 내 문의 목록 (최근 것 먼저)
const listMyInquiries = async ({ userId }, deps = defaultDeps()) => {
    const rows = await deps.db.Inquiry.findAll({
        where: { user_id: userId },
        attributes: ['id', 'category', 'title', 'status', 'created_at', 'answered_at'],
        order: [['created_at', 'DESC'], ['id', 'DESC']],
        limit: MY_LIST_LIMIT,
    });
    return rows.map(listItemOf);
};

// 주소 번호 → 양의 정수 글자만 (아니면 null → 404)
const parseInquiryId = (raw) => (typeof raw === 'string' && /^[1-9][0-9]{0,17}$/.test(raw) ? raw : null);

// 내 문의 상세: 남의 것·없는 번호 모두 404 (있는지 티 안 냄)
const getMyInquiry = async ({ userId, inquiryId }, deps = defaultDeps()) => {
    const id = parseInquiryId(inquiryId);
    if (!id) throw notFound();
    const row = await deps.db.Inquiry.findOne({ where: { id, user_id: userId } });
    if (!row) throw notFound();
    const replies = await deps.db.InquiryReply.findAll({
        where: { inquiry_id: id },
        attributes: ['id', 'body', 'created_at'],
        order: [['created_at', 'ASC'], ['id', 'ASC']],
    });
    return inquiryView(row, replies);
};

// 답 알림 모양 (2-16 관리자 답이 기존 알림 저장에 넘김)
const inquiryReplyNotification = ({ replyId, inquiryId, title }) => ({
    type: 'system',
    sourceKey: `inquiry-reply:${replyId}`,
    title: '문의에 답이 왔어요',
    body: title,
    target: { kind: 'inquiry', inquiryId: Number(inquiryId) },
});

module.exports = {
    INQUIRY_STATUS,
    INQUIRY_REPLY_FROM,
    MY_LIST_LIMIT,
    inquiryError,
    inquiryView,
    listMyInquiries,
    getMyInquiry,
    inquiryReplyNotification,
};
