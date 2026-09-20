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

    console.error('\x1b[31m%s\x1b[0m', err.stack);

    const statusCode = err.status || err.statusCode || 500;

    res.status(statusCode).json({
        success: false,
        message: err.message || '서버 내부에서 에러가 발생했습니다.',
        code: err.code,
        error: process.env.NODE_ENV === 'production' ? undefined : err.stack,
    });
};
