/**
 * @file appError.js
 * @desc 글로벌 에러 미들웨어가 읽을 수 있는 HTTP 상태코드 포함 에러 유틸리티입니다.
 */

/**
 * HTTP 응답 상태를 포함하는 애플리케이션 에러입니다.
 * 컨트롤러·서비스·미들웨어는 이 에러를 throw/next 하고, 응답 포맷은 globalErrorHandler가 담당합니다.
 */
class AppError extends Error {
    constructor(message, status = 500) {
        super(message);
        this.name = "AppError";
        this.status = status;
    }
}

/**
 * 짧은 형태로 AppError를 생성합니다.
 * @param {string} message - 클라이언트에 전달할 에러 메시지
 * @param {number} status - HTTP 상태코드
 * @returns {AppError}
 */
const createError = (message, status = 500) => new AppError(message, status);

module.exports = { AppError, createError };
