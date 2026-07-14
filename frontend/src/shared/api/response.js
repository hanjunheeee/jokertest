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
const handleUnauthorized = async (response) => {
    const errorData = await readErrorBody(response);

    // 등록된 도메인 핸들러가 있으면 실제 처리는 그쪽에 맡깁니다.
    if (unauthorizedHandler) {
        return await unauthorizedHandler(errorData);
    }

    // 핸들러가 등록되지 않은 경우에도 호출한 쪽에서 실패를 알 수 있게 에러를 던집니다.
    throw new Error(errorData.message || "인증에 실패했습니다.");
};

// 401 외의 실패 응답을 공통 에러로 처리합니다.
const handleErrorResponse = async (response) => {
    const errorData = await readErrorBody(response);
    throw new Error(errorData.message || "API 요청 중 에러가 발생했습니다.");
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
