// 서버 응답 풀기 공통 (401·실패 응답은 Error로 던지고, 성공이면 data만 꺼냄)
// api client가 씀, 401 처리 함수는 main.jsx가 auth 것으로 등록
// shared가 auth 영역을 직접 안 부르게 바깥에서 받아 둠
let unauthorizedHandler = null;

// 앱 시작 때 한 번 등록
export const setUnauthorizedHandler = (handler) => {
    unauthorizedHandler = handler;
};

// 본문이 json이 아니어도 빈 객체로 계속 감
const readErrorBody = async (response) => {
    return await response.json().catch(() => ({}));
};

// 화면이 보는 서버 오류 정보(code·재전송 대기·남은 횟수 등)를 Error에 옮겨 붙임
const toApiError = (errorData, fallbackMessage) => {
    const error = new Error(errorData.message || fallbackMessage);
    if (errorData.code) error.code = errorData.code;
    if (errorData.ok !== undefined) error.ok = errorData.ok;
    if (typeof errorData.resendAfterSec === "number") error.resendAfterSec = errorData.resendAfterSec;
    if (typeof errorData.attemptsRemaining === "number") error.attemptsRemaining = errorData.attemptsRemaining;
    if (typeof errorData.revision === "string") error.revision = errorData.revision;
    if (Array.isArray(errorData.slots)) error.slots = errorData.slots;
    if (errorData.success !== undefined) error.success = errorData.success;
    return error;
};

// 가입 이메일 인증 증표가 없거나 틀린 401 (로그인 풀림 아님)
const SIGNUP_PROOF_ERROR_CODES = new Set(["SIGNUP_PROOF_REQUIRED", "SIGNUP_PROOF_INVALID"]);

// 가입 인증 401은 화면에 그대로 던지고, 나머지 401만 auth 처리로 넘김
const handleUnauthorized = async (response) => {
    const errorData = await readErrorBody(response);

    if (errorData.success === false && SIGNUP_PROOF_ERROR_CODES.has(errorData.code)) {
        const error = toApiError(errorData, "이메일 인증이 필요합니다.");
        error.status = 401;
        throw error;
    }

    // 처리 함수가 없으면(시험 등) 일반 오류로 던짐
    if (unauthorizedHandler) {
        return await unauthorizedHandler(errorData);
    }

    throw toApiError(errorData, "인증에 실패했습니다.");
};

// 401 말고 실패 응답은 상태 코드를 붙여 던짐
const handleErrorResponse = async (response) => {
    const errorData = await readErrorBody(response);
    const error = toApiError(errorData, "API 요청 중 에러가 발생했습니다.");
    error.status = response.status;
    throw error;
};

// { data } 모양이면 data만, 아니면 본문 그대로
const parseResponseBody = async (response) => {
    const body = await response.json();

    return body.data !== undefined ? body.data : body;
};

// 401 → 실패 → 성공 순으로 봄
export const handleApiResponse = async (response) => {
    if (response.status === 401) {
        return await handleUnauthorized(response);
    }

    if (!response.ok) {
        await handleErrorResponse(response);
    }

    return await parseResponseBody(response);
};
