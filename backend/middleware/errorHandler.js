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
    // SIGNUP_PROOF_REQUIRED/SIGNUP_PROOF_INVALID(auth.service.js가 던지는 유일한 code
    // 있는 오류)는 이미 원문을 담지 않는 고정 한국어 메시지이므로 그 code·status(401)를
    // 그대로 응답한다 — AC-01/AC-03/AC-04 계약이 이 두 code·status를 구분해서 쓴다. 그 외
    // (가입 필드 검증 실패·중복 이메일/닉네임·notFoundHandler의 404·JSON 파서 오류 등 code가
    // 없는 모든 오류)는 status만으로 INVALID_INPUT(400)/SERVER_ERROR(그 외)로 수렴시키고,
    // err.message·err.stack·err.body 어느 것도 로그·응답에 담지 않는다.
    const signupScopedPath = String(req.originalUrl || req.url || '')
        .split('?')[0].replace(/\/+$/, '').toLowerCase();
    if (signupScopedPath.startsWith('/auth/signup')) {
        res.set('Cache-Control', 'no-store');
        if (typeof err.code === 'string' && err.code) {
            const statusCode = err.status || err.statusCode || 500;
            return res.status(statusCode).json({ success: false, message: err.message, code: err.code });
        }
        const status = (err.status || err.statusCode) === 400 ? 400 : 500;
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
