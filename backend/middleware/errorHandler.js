export const notFoundHandler = (req, res, next) => {
    const error = new Error(`${req.method} ${req.url} 라우터를 찾을 수 없습니다.`)
    error.status = 404;
    next(error);
};

export const globalErrorHandler = (err, req, res, next) => {
    console.error('\x1b[31m%s\x1b[0m', err.stack);

    const statusCode = err.status || 500;

    res.status(statusCode).json({
        success: false,
        message: err.message || '서버 내부에서 에러가 발생했습니다.',
        error: process.env.NODE_ENV === 'production' ? '💥' : err.stack,
    })
}