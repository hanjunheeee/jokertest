/**
 * 404 Not Found 라우터 핸들러
 * 클라이언트가 존재하지 않는 API 주소나 메서드로 요청을 보냈을 때 호출됩니다.
 *
 * @param {Object} req - Express 요청 객체
 * @param {Object} res - Express 응답 객체
 * @param {Function} next - Express next 미들웨어 함수
 */
export const notFoundHandler = (req, res, next) => {
    // 요청된 메서드와 URL을 포함하여 에러 메시지 생성
    const error = new Error(`${req.method} ${req.url} 라우터를 찾을 수 없습니다.`)
    error.status = 404; // 상태 코드를 404로 설정

    // 생성한 에러를 다음 미들웨어(전역 에러 핸들러)로 전달
    next(error);
};

/**
 * 전역(Global) 에러 핸들러
 * 앱 전체에서 발생한 모든 에러(next(error)로 넘어온 에러)를 최종적으로 처리하는 곳입니다.
 * 주의: Express에서 에러 핸들러로 인식되려면 반드시 매개변수가 4개(err, req, res, next)여야 합니다.
 *
 * @param {Error} err - 이전 라우터나 미들웨어에서 넘어온 에러 객체
 * @param {Object} req - Express 요청 객체
 * @param {Object} res - Express 응답 객체
 * @param {Function} next - Express next 미들웨어 함수 (여기선 호출 안 함)
 */
export const globalErrorHandler = (err, req, res, next) => {
    // 서버 콘솔에 에러 스택을 빨간색(\x1b[31m)으로 눈에 띄게 출력하여 디버깅을 돕습니다.
    console.error('\x1b[31m%s\x1b[0m', err.stack);

    // 에러 객체에 상태 코드가 지정되어 있으면 그걸 쓰고, 없으면 500(서버 내부 에러)으로 처리
    const statusCode = err.status || 500;

    // 프론트엔드가 파싱하기 좋게 일관된 JSON 형태로 에러 응답을 내려줍니다.
    res.status(statusCode).json({
        success: false,
        message: err.message || '서버 내부에서 에러가 발생했습니다.',
        // 보안 핵심: 실서버(production)에서는 해커에게 힌트를 주지 않기 위해 에러 스택을 숨깁니다
        error: process.env.NODE_ENV === 'production' ? '💥' : err.stack,
    })
}