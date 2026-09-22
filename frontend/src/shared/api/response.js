let unauthorizedHandler = null;

// 401을 "어떻게 처리할지"는 auth 도메인 책임입니다.
// shared API 계층은 401을 감지하기만 하고, 실제 로그아웃/리다이렉트 처리는 등록된 함수에 맡깁니다.
export const setUnauthorizedHandler = (handler) => {
    unauthorizedHandler = handler;
};

// 서버가 내려준 에러 응답 body를 읽습니다.
// JSON이 아니거나 body가 비어 있어도 에러 처리 자체가 깨지지 않도록 빈 객체를 반환합니다.
const readErrorBody = async (response) => {
    return await response.json().catch(() => ({}));
};

// 401 인증 실패 응답을 처리합니다.
// 여기서는 auth store를 직접 만지지 않고, 등록된 도메인 핸들러만 호출합니다.
// 서버 응답 body의 code(backend/utils/appError.js가 실어 보내는 안정적인 값)를 Error
// 객체에도 실어, 호출하는 쪽이 메시지 문자열이 아니라 code로 분기할 수 있게 합니다
// (F-05: state 만료/재사용/이메일 충돌처럼 분기해야 하는 상황이 늘어나며 추가했습니다).
const toApiError = (errorData, fallbackMessage) => {
    const error = new Error(errorData.message || fallbackMessage);
    if (errorData.code) error.code = errorData.code;
    // F-29c AC-01: 응답 본문의 ok를 그대로 싣습니다 — code만 넘기면 호출하는 쪽이 "서버가
    // 실제로 ok:false로 거부했다"와 "계약에 없는 본문(예: 400인데 ok:true)"을 구분할 수
    // 없어, 후자를 특정 실패 사유로 확정해 버립니다. 값 자체를 판단하지 않고 그대로 싣기만
    // 하므로, 이 값을 읽지 않는 기존 호출부의 동작은 달라지지 않습니다.
    if (errorData.ok !== undefined) error.ok = errorData.ok;
    // F-31b(AC-03): 가입 이메일 인증 실패 메타데이터입니다. 남은 재발송 대기(초)와 남은
    // 오입력 시도 횟수는 화면에 그대로 보여줘야 하는 값이라, 호출하는 쪽이 서버가 실제로
    // 보낸 값과 "생략됨"을 구분할 수 있게 숫자일 때만 싣습니다.
    if (typeof errorData.resendAfterSec === "number") error.resendAfterSec = errorData.resendAfterSec;
    if (typeof errorData.attemptsRemaining === "number") error.attemptsRemaining = errorData.attemptsRemaining;
    // F-33 E-2(AC-03): 이모티콘 팔레트 저장이 409 REVISION_MISMATCH로 거부되면 서버가
    // "지금의 진짜 값"(revision + slots 8칸)을 함께 내려보낸다. 그 값이 여기서 버려지면
    // 화면은 충돌을 알면서도 무엇으로 재조정해야 하는지 모른 채 다시 GET을 던져야 한다.
    // 값을 판단하지 않고 서버가 실제로 보낸 형태일 때만 그대로 싣는다 — 읽지 않는 기존
    // 호출부의 동작은 달라지지 않는다.
    if (typeof errorData.revision === "string") error.revision = errorData.revision;
    if (Array.isArray(errorData.slots)) error.slots = errorData.slots;
    if (errorData.success !== undefined) error.success = errorData.success;
    return error;
};

// F-31b(AC-02/AC-05): 가입 증명 거부(SIGNUP_PROOF_REQUIRED/SIGNUP_PROOF_INVALID)는
// backend/middleware/errorHandler.js가 401 { success:false, code, message }로 응답한다 —
// 실제로 로그인된 세션이 만료된 것이 아니라, 아직 계정도 없는 가입 화면에서 증명이
// 없거나 유효하지 않다는 뜻이다. 등록된 전역 401 처리기(handleAuthUnauthorized)에 먼저
// 넘기면 로그아웃 처리 후 /login으로 이동시키거나 code를 버린 일반 Error를 던져(F-05
// 이후로 이미 그렇게 동작한다) 가입 화면이 두 코드를 구분할 수 없게 된다. 그래서 이
// 두 코드만 전역 처리기보다 먼저 구조화된 오류로 던진다.
const SIGNUP_PROOF_ERROR_CODES = new Set(["SIGNUP_PROOF_REQUIRED", "SIGNUP_PROOF_INVALID"]);

const handleUnauthorized = async (response) => {
    const errorData = await readErrorBody(response);

    if (errorData.success === false && SIGNUP_PROOF_ERROR_CODES.has(errorData.code)) {
        const error = toApiError(errorData, "이메일 인증이 필요합니다.");
        error.status = 401;
        throw error;
    }

    // 등록된 도메인 핸들러가 있으면 실제 처리는 그쪽에 맡깁니다.
    if (unauthorizedHandler) {
        return await unauthorizedHandler(errorData);
    }

    // 핸들러가 등록되지 않은 경우에도 호출한 쪽에서 실패를 알 수 있게 에러를 던집니다.
    throw toApiError(errorData, "인증에 실패했습니다.");
};

// 401 외의 실패 응답을 공통 에러로 처리합니다.
//
// status를 함께 싣습니다 — "서버가 실제로 거부를 답했다"와 "응답 자체를 받지 못했다(fetch가
// 던진 네트워크 오류)"는 호출하는 쪽에서 다르게 다뤄야 하기 때문입니다. 예: 멱등 키를 쓰는
// 발송은 전자에서는 결과가 확정됐으므로 다음 논리 발송으로 넘어가고, 후자에서는 같은 키로
// 재시도해야 두 번째 요청이 두 번째 행을 만들지 않습니다(F-19 AC-06).
const handleErrorResponse = async (response) => {
    const errorData = await readErrorBody(response);
    const error = toApiError(errorData, "API 요청 중 에러가 발생했습니다.");
    error.status = response.status;
    throw error;
};

// 성공 응답 body를 읽고, API 응답 형태에 맞게 필요한 값만 반환합니다.
const parseResponseBody = async (response) => {
    const body = await response.json();

    // 서버 응답이 { data: ... } 형태면 data만 반환하고, 아니면 body 전체를 반환합니다.
    return body.data !== undefined ? body.data : body;
};

// fetch 응답을 받아 인증 실패, 일반 실패, 성공 응답을 한곳에서 처리합니다.
export const handleApiResponse = async (response) => {
    // 401은 로그인 만료, 인증 실패 같은 상황입니다.
    if (response.status === 401) {
        return await handleUnauthorized(response);
    }

    // 401 외의 실패 응답도 공통 에러로 처리합니다.
    if (!response.ok) {
        await handleErrorResponse(response);
    }

    return await parseResponseBody(response);
};
