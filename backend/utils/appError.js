class AppError extends Error {
    constructor(message, status = 500, code) {
        super(message);
        this.name = "AppError";
        this.status = status;
        if (code) this.code = code;
    }
}

// code는 선택 값입니다. 프론트가 메시지 문자열이 아니라 안정적인 값으로 분기해야 하는
// 경우(예: 액세스 토큰 만료만 골라 갱신을 시도)에만 붙입니다.
const createError = (message, status = 500, code) => new AppError(message, status, code);

module.exports = { AppError, createError };
