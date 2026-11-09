'use strict';

// 관리자 기록 동작 이름 파일, 남기는 동작 전부를 한 곳에 미리 적음 (설계 5-4 표) + 처리 이력 칸 묶음
// 기록 도우미(audit.js)가 모르는 이름을 거절할 때, 처리 이력(1-4)이 동작 묶음으로 거를 때 씀

const names = [
    // 로그인·로그아웃 (실패는 admin_login_attempts)
    'ADMIN_LOGIN', 'ADMIN_LOGOUT',
    // 이메일 전체 보기 · 신고 채팅 증거 열기
    'VIEW_PII', 'VIEW_EVIDENCE',
    // 제재
    'FORCE_DISCONNECT', 'BAN', 'BAN_UPDATE', 'UNBAN',
    // 신고 처리
    'REPORT_RESOLVE', 'REPORT_DISMISS',
    'ANNOUNCE',
    'INQUIRY_REPLY',
    'MAINTENANCE_UPDATE', 'MAINTENANCE_FORCE_END',
    'BANNED_WORD_ADD', 'BANNED_WORD_TOGGLE',
    'REFUND', 'WALLET_ADJUST',
    'PRODUCT_CREATE', 'PRODUCT_UPDATE', 'COUPON_CREATE', 'COUPON_TOGGLE', 'TERMS_CREATE',
];

// 이름 → 같은 글자 (예: AUDIT_ACTIONS.BAN === 'BAN'), 오타는 undefined라 기록 도우미가 거절
const AUDIT_ACTIONS = Object.freeze(Object.fromEntries(names.map((name) => [name, name])));

// 처리 이력 칸 → 동작 묶음 (공지 발송 · 제재·해제, 신고는 처리만)
const AUDIT_KINDS = Object.freeze({
    announce: Object.freeze([AUDIT_ACTIONS.ANNOUNCE]),
    sanction: Object.freeze([
        AUDIT_ACTIONS.FORCE_DISCONNECT, AUDIT_ACTIONS.BAN, AUDIT_ACTIONS.BAN_UPDATE, AUDIT_ACTIONS.UNBAN, AUDIT_ACTIONS.REPORT_RESOLVE,
    ]),
});

module.exports = { AUDIT_ACTIONS, AUDIT_KINDS };
