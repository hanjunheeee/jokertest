// 서버 api 부르기 공통 (쿠키 같이 보내기·토큰 만료면 갱신 뒤 한 번 다시 요청)
// 영역 api 파일(auth·economy·library·lobby·notifications·store·user)과 useSocket이 씀
import { handleApiResponse } from "./response.js";
import { API_BASE_URL } from "../env.js";

const BASE_URL = API_BASE_URL;

// 쿠키 인증이라 credentials 늘 넣고, 옛 응답을 안 쓰게 캐시 끔
const createRequestOptions = (options) => {
    return {
        method: "GET",

        credentials: "include",

        cache: "no-store",

        ...options,

        // 기본은 json, 넘긴 headers가 덮어씀
        headers: {
            "Content-Type": "application/json",
            ...options.headers,
        },
    };
};

// 여러 요청이 동시에 만료돼도 갱신 요청은 하나만 보냄
let refreshPromise = null;

// 갱신 성공 여부만 돌려줌 (실패·연결 오류는 false), useSocket도 다시 연결 전에 씀
export const refreshAccessToken = () => {
    if (!refreshPromise) {
        refreshPromise = fetch(`${BASE_URL}/auth/refresh`, {
            method:      "POST",
            credentials: "include",
            cache:       "no-store",
        })
            .then((response) => response.ok)
            .catch(() => false)
            // 끝나면 비워서 다음 만료 때 새로 갱신
            .finally(() => { refreshPromise = null; });
    }
    return refreshPromise;
};

// 토큰 만료 말고 401을 로그아웃 없이 오류로 던짐 (비밀번호 변경처럼 401이 "입력 틀림"인 요청용)
const throwUnauthorizedInline = async (response) => {
    const body = await response.json().catch(() => ({}));
    const error = new Error(body.message || "인증에 실패했습니다.");
    error.status = 401;
    if (body.code) error.code = body.code;
    throw error;
};

// 응답 풀기는 response.js에 맡김, _isRetry는 다시 보낸 요청 표시
// options.unauthorizedInline이 참이면 (갱신 뒤에도 남은) 401을 공통 로그아웃 처리로 안 넘김
export const apiClient = async (endpoint, options = {}, _isRetry = false) => {
    const url = `${BASE_URL}${endpoint}`;
    const { unauthorizedInline = false, ...fetchOptions } = options;
    const requestOptions = createRequestOptions(fetchOptions);

    const response = await fetch(url, requestOptions);

    // 토큰 만료 401만 한 번 갱신 뒤 다시 보냄 (다시 보낸 요청은 또 안 함)
    if (response.status === 401 && !_isRetry && endpoint !== "/auth/refresh") {
        // 본문은 response.js도 읽어야 해서 복사본으로 봄
        const body = await response.clone().json().catch(() => ({}));
        if (body.code === "ACCESS_TOKEN_EXPIRED") {
            const refreshed = await refreshAccessToken();
            // 갱신 실패면 그대로 401 처리로 넘어감
            if (refreshed) {
                return apiClient(endpoint, options, true);
            }
        }
    }

    if (response.status === 401 && unauthorizedInline) {
        await throwUnauthorizedInline(response);
    }

    return await handleApiResponse(response);
};

// 메서드별 짧은 이름, body는 json 글자로 바꿔 보냄
export const api = {
    get:    (endpoint)       => apiClient(endpoint),
    post:   (endpoint, body) => apiClient(endpoint, { method: "POST",   body: JSON.stringify(body) }),
    put:    (endpoint, body) => apiClient(endpoint, { method: "PUT",    body: JSON.stringify(body) }),
    patch:  (endpoint, body, extra = {}) => apiClient(endpoint, { method: "PATCH", body: JSON.stringify(body), ...extra }),
    delete: (endpoint)       => apiClient(endpoint, { method: "DELETE" }),
};
