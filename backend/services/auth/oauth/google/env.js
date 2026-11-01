// Google OAuth 환경 파일, 환경변수 읽기 · 시간 초과 값과 판정
// 부를 때마다 읽음 (load 때 붙잡지 않음)
const { createError } = require("../../../../utils/appError");

// 요청 시간 제한 (환경변수 없으면 8초)
const GOOGLE_REQUEST_TIMEOUT_MS = () => Number(process.env.GOOGLE_OAUTH_TIMEOUT_MS) || 8000;

// fetch 시간 초과·중단 오류인지
const isTimeoutError = (error) => error?.name === "TimeoutError" || error?.name === "AbortError";

// 꼭 있어야 하는 환경변수, 없으면 500
const readRequiredEnv = (name) => {
    const value = process.env[name];
    if (!value) {
        throw createError(`${name} 환경변수가 설정되지 않았습니다.`, 500, "GOOGLE_OAUTH_NOT_CONFIGURED");
    }
    return value;
};

module.exports = {
    GOOGLE_REQUEST_TIMEOUT_MS,
    isTimeoutError,
    readRequiredEnv,
};
