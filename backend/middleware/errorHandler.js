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

    // F-31a(AC-06): 가입 이메일 인증(발송·확인) 경로의 예기치 못한 오류는 원본 메시지·
    // 스택을 절대 노출하지 않는다. 알려진 실패(코드 오류·시도 초과·재발송 대기)는
    // 컨트롤러가 이미 고정된 형태로 응답하므로, 여기 도달하는 것은 잘못된 JSON 본문이나
    // 예상 밖 예외뿐이다. 기존 POST /auth/signup(계정 생성 자체)의 응답 형태는 이 범위에
    // 포함하지 않는다 — SIGNUP_PROOF_REQUIRED/SIGNUP_PROOF_INVALID/중복 이메일·닉네임 모두
    // 원문을 담지 않는 고정 메시지이며, 아래 일반 처리기가 그대로 응답해도 원문 노출 문제가
    // 없다.
    const signupCodeRequestPath = String(req.originalUrl || req.url || '')
        .split('?')[0].replace(/\/+$/, '').toLowerCase();
    if (signupCodeRequestPath.startsWith('/auth/signup/email-code')) {
        res.set('Cache-Control', 'no-store');
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
