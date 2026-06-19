/**
 * @file errorHandler.js
 * @desc 전역 에러 핸들러. 라우트·컨트롤러·서비스에서 전달한 에러 응답 포맷을 통일합니다.
 */

const { createError } = require("../utils/appError");

/**
 * 등록되지 않은 라우트 접근 시 404 에러를 생성해 다음 핸들러로 전달합니다.
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
exports.notFoundHandler = (req, res, next) => {
    next(createError(`${req.method} ${req.url} 라우터를 찾을 수 없습니다.`, 404));
};

/**
 * 앱 전역 에러 핸들러. Express는 파라미터가 4개여야 에러 핸들러로 인식합니다.
 * @param {Error}  err
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
exports.globalErrorHandler = (err, req, res, next) => {
    if (res.headersSent) {
        return next(err);
    }

    console.error('\x1b[31m%s\x1b[0m', err.stack);

    const statusCode = err.status || err.statusCode || 500;

    res.status(statusCode).json({
        success: false,
        message: err.message || '서버 내부에서 에러가 발생했습니다.',
        error: process.env.NODE_ENV === 'production' ? undefined : err.stack,
    });
};
