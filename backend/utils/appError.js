// 앱 오류 파일, HTTP 상태·오류 코드를 싣는 오류 클래스 + 만들기 함수
// 서비스·컨트롤러 등이 createError로 던지고, 오류 처리 미들웨어가 읽어 응답함

// 상태 기본값 500, code는 줄 때만 붙임 (화면이 code로 경우를 나눔)
class AppError extends Error {
    constructor(message, status = 500, code) {
        super(message);
        this.name = "AppError";
        this.status = status;
        if (code) this.code = code;
    }
}

// new 없이 한 줄로 던지게
const createError = (message, status = 500, code) => new AppError(message, status, code);

module.exports = { AppError, createError };
