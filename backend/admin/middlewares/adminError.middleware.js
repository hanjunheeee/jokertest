'use strict';

// 관리자 오류 처리기 파일, /admin-api 오류를 { ok:false, code, message } 한 모양으로 (덧붙인 칸은 error.details에서)
// admin/index.js가 맨 끝에 붙임, 서비스는 createError(문구, 상태, code)로 던지고 덧붙일 칸은 error.details = { field } 처럼

const INTERNAL = Object.freeze({ code: 'ADMIN_INTERNAL', message: '서버에서 문제가 생겼어요. 잠시 뒤 다시 해 주세요.' });
const CODE_PATTERN = /^[A-Z][A-Z0-9_]*$/;
const RESERVED = new Set(['ok', 'code', 'message']);

// 그대로 내보내도 되는 오류인지: 대문자 code + 400~599 상태, 단 500은 속 사정일 수 있어 숨김
const isPublicError = (error) => Boolean(error)
    && typeof error.code === 'string' && CODE_PATTERN.test(error.code)
    && Number.isInteger(error.status) && error.status >= 400 && error.status <= 599 && error.status !== 500
    && typeof error.message === 'string' && error.message.length > 0;

// error.details에서 ok·code·message 뺀 칸만 (예: { field:'reason' } → { field:'reason' })
const extraFieldsOf = (details) => {
    if (!details || typeof details !== 'object' || Array.isArray(details)) return {};
    return Object.fromEntries(Object.entries(details).filter(([key]) => !RESERVED.has(key)));
};

// 오류 처리기 (Express는 인자 넷이어야 오류 처리기로 봄)
// eslint-disable-next-line no-unused-vars
const adminErrorHandler = (error, req, res, next) => {
    if (isPublicError(error)) {
        return res.status(error.status).json({ ok: false, code: error.code, message: error.message, ...extraFieldsOf(error.details) });
    }
    // 모르는 오류: 서버 기록엔 이름만 (문구에 SQL·개인정보가 섞일 수 있어서)
    console.error('[ADMIN] 처리 못 한 오류 —', error?.name ?? typeof error, error?.code ?? '');
    return res.status(500).json({ ok: false, ...INTERNAL });
};

module.exports = { adminErrorHandler, INTERNAL };
