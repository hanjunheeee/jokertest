let unauthorizedHandler = null;

export const setUnauthorizedHandler = (handler) => {
    unauthorizedHandler = handler;
};

const readErrorBody = async (response) => {
    return await response.json().catch(() => ({}));
};

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

const SIGNUP_PROOF_ERROR_CODES = new Set(["SIGNUP_PROOF_REQUIRED", "SIGNUP_PROOF_INVALID"]);

const handleUnauthorized = async (response) => {
    const errorData = await readErrorBody(response);

    if (errorData.success === false && SIGNUP_PROOF_ERROR_CODES.has(errorData.code)) {
        const error = toApiError(errorData, "이메일 인증이 필요합니다.");
        error.status = 401;
        throw error;
    }

    if (unauthorizedHandler) {
        return await unauthorizedHandler(errorData);
    }

    throw toApiError(errorData, "인증에 실패했습니다.");
};

const handleErrorResponse = async (response) => {
    const errorData = await readErrorBody(response);
    const error = toApiError(errorData, "API 요청 중 에러가 발생했습니다.");
    error.status = response.status;
    throw error;
};

const parseResponseBody = async (response) => {
    const body = await response.json();

    return body.data !== undefined ? body.data : body;
};

export const handleApiResponse = async (response) => {
    if (response.status === 401) {
        return await handleUnauthorized(response);
    }

    if (!response.ok) {
        await handleErrorResponse(response);
    }

    return await parseResponseBody(response);
};
