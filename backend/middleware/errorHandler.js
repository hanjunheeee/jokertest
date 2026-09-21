const { createError } = require("../utils/appError");

exports.notFoundHandler = (req, res, next) => {
    next(createError(`${req.method} ${req.url} 라우터를 찾을 수 없습니다.`, 404));
};

exports.globalErrorHandler = (err, req, res, next) => {
    if (res.headersSent) {
        return next(err);
    }

    // F-29a(AC-03): /auth/find-id는 원본 오류(SQL·스택·요청 입력값 등)를 로그·응답 어디에도
    // 남기지 않는다 — express.json()이 이 경로보다 먼저 던지는 잘못된 JSON 본문 오류
    // (SyntaxError, status 400)까지 포함해 이 라우트로 가는 모든 미처리 오류는 고정된
    // 코드로만 응답한다. originalUrl 완전일치는 /auth/find-id?x=1 같은 쿼리나
    // /auth/find-id/ 같은 후행 슬래시 변형을 놓친다 — 쿼리를 떼고 후행 슬래시를 지운
    // 경로로 비교해 그 변형들도 이 분기로 들어오게 한다.
    const findIdRequestPath = String(req.originalUrl || req.url || '').split('?')[0].replace(/\/+$/, '');
    if (findIdRequestPath === '/auth/find-id') {
        const status = (err.status || err.statusCode) === 400 ? 400 : 500;
        const code = status === 400 ? 'INVALID_INPUT' : 'SERVER_ERROR';
        return res.status(status).json({ ok: false, code });
    }

    // F-31a(AC-06 재검토): 가입 범위 세 경로(POST /auth/signup·/auth/signup/email-code·
    // /auth/signup/email-code/verify — 쿼리·후행 슬래시·대소문자 변형 포함) 전부에서 원본
    // 메시지·스택·요청 본문이 로그·응답 어디에도 남지 않아야 한다. 이전 회차는
    // /auth/signup/email-code만 이 보호에 포함시켰다 — POST /auth/signup 자체의 JSON 파서
    // 오류(express.json()이 body-parser로 던지는 SyntaxError에는 원본 요청 본문 전체가
    // err.body에 실려 있다)나 예상 밖 예외는 아래 일반 처리기로 흘러 console.error(err.stack)로
    // 로그에 남을 수 있었다.
    //
    // F-31a(AC-06 CODEX-3 대응): code가 있는 오류는 이 표에 있는 것만 그 code와 여기
    // 직접 박아 둔 고정 문구로 응답한다 — err.message를 그대로 실으면, 이 코드가 앞으로
    // 다른 곳에서 원본을 담은 채로 재사용되기만 해도 그 원문이 그대로 응답에 새 나간다.
    // SIGNUP_PROOF_REQUIRED/SIGNUP_PROOF_INVALID(auth.service.js가 던지는 유일한 code
    // 있는 오류)만 이 표에 있다 — AC-01/AC-03/AC-04 계약이 이 두 code·status(401)를
    // 구분해서 쓴다. 표에 없는 code(예상하지 못한 코드)는 status·message와 무관하게
    // 고정 SERVER_ERROR(500)로 수렴한다.
    const SIGNUP_SCOPED_ALLOWED_ERROR_CODES = {
        SIGNUP_PROOF_REQUIRED: { status: 401, message: '이메일 인증이 필요합니다.' },
        SIGNUP_PROOF_INVALID: { status: 401, message: '이메일 인증 증명이 유효하지 않습니다.' },
    };
    const signupScopedPath = String(req.originalUrl || req.url || '')
        .split('?')[0].replace(/\/+$/, '').toLowerCase();
    if (signupScopedPath.startsWith('/auth/signup')) {
        res.set('Cache-Control', 'no-store');
        if (typeof err.code === 'string' && err.code) {
            const fixed = SIGNUP_SCOPED_ALLOWED_ERROR_CODES[err.code];
            if (fixed) {
                return res.status(fixed.status).json({ success: false, message: fixed.message, code: err.code });
            }
            return res.status(500).json({ ok: false, code: 'SERVER_ERROR' });
        }
        // code가 없는 오류: 가입 필드 검증 실패(400, INVALID_INPUT)와, 이미 사용 중인
        // 이메일/닉네임(409 — auth.service.js·user.repositories.js가 SQL·요청 입력을
        // 그대로 담지 않고 직접 고정한 안전한 문자열만 던진다)은 이번 변경 이전부터의
        // 기존 status·문구를 그대로 유지한다(회귀 금지). 그 밖(404·예상하지 못한 500 등)은
        // SERVER_ERROR로 수렴시키고, err.message·err.stack·err.body 어느 것도 로그·응답에
        // 담지 않는다.
        const rawStatus = err.status || err.statusCode;
        if (rawStatus === 409) {
            return res.status(409).json({ success: false, message: err.message });
        }
        const status = rawStatus === 400 ? 400 : 500;
        const code = status === 400 ? 'INVALID_INPUT' : 'SERVER_ERROR';
        return res.status(status).json({ ok: false, code });
    }

    // F-29b(AC-06/A-08): 비밀번호 재설정 범위(요청·verify·confirm 및 그 밖의 하위 경로)는
    // 대소문자·후행 슬래시와 무관하게 같은 고정 응답으로 수렴한다 — 토큰이 담긴 쿼리·본문
    // 오류가 원본 메시지·스택으로 새 나가지 않게 한다. 파서 오류(잘못된 JSON 등)로 이
    // 경로에 도달하지 못한 요청도 originalUrl만으로 여기서 잡힌다.
    const resetRequestPath = String(req.originalUrl || req.url || '')
        .split('?')[0].replace(/\/+$/, '').toLowerCase();
    if (resetRequestPath.startsWith('/auth/password-reset')) {
        res.set('Cache-Control', 'no-store');
        const rawStatus = err.status || err.statusCode;
        const status = rawStatus === 400 ? 400 : (rawStatus === 404 ? 404 : 500);
        const code = status === 400 ? 'INVALID_INPUT' : (status === 404 ? 'INVALID' : 'SERVER_ERROR');
        return res.status(status).json({ ok: false, code });
    }

    console.error('\x1b[31m%s\x1b[0m', err.stack);

    const statusCode = err.status || err.statusCode || 500;

    res.status(statusCode).json({
        success: false,
        message: err.message || '서버 내부에서 에러가 발생했습니다.',
        code: err.code,
        error: process.env.NODE_ENV === 'production' ? undefined : err.stack,
    });
};
