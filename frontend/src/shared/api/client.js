import { handleApiResponse } from "@/shared/api/response";

// Vite 환경변수에 설정된 백엔드 API 기본 주소입니다.
// 예: VITE_API_BASE_URL=http://localhost:4000
const BASE_URL = import.meta.env.VITE_API_BASE_URL;

// 호출하는 쪽에서 넘긴 options와 기본 fetch 옵션을 합칩니다.
const createRequestOptions = (options) => {
    // 모든 요청에 공통으로 들어갈 기본 fetch 옵션입니다.
    // headers는 맨 마지막에 별도로 합쳐야 합니다 — ...options를 headers보다 먼저 펼치면,
    // options 안에 headers가 있을 때 그 값이 아래 Content-Type 병합을 통째로 덮어써 버립니다.
    return {
        // 별도 지정이 없으면 GET 요청으로 보냅니다.
        method: "GET",

        // 쿠키 기반 인증을 사용할 수 있도록 요청에 쿠키를 포함합니다.
        credentials: "include",

        // 브라우저 캐시를 쓰지 않고 매번 서버에 요청합니다.
        cache: "no-store",

        // method, body 등 호출하는 쪽에서 넘긴 옵션을 먼저 반영합니다.
        ...options,

        // 기본적으로 JSON 요청을 보낸다고 알려줍니다. headers는 항상 마지막에 계산해서,
        // 호출하는 쪽이 headers를 넘겨도 Content-Type이 사라지지 않게 합니다.
        headers: {
            "Content-Type": "application/json",
            ...options.headers,
        },
    };
};

// fetch를 감싼 공통 API 요청 함수입니다.
// endpoint는 "/users/me" 같은 API 경로이고, options는 fetch 옵션입니다.
export const apiClient = async (endpoint, options = {}) => {
    // 기본 API 주소와 endpoint를 합쳐 실제 요청 URL을 만듭니다.
    const url = `${BASE_URL}${endpoint}`;
    const requestOptions = createRequestOptions(options);

    // 실제 HTTP 요청을 보냅니다.
    const response = await fetch(url, requestOptions);

    return await handleApiResponse(response);
};

// 자주 쓰는 HTTP 메서드를 짧게 호출할 수 있게 만든 헬퍼 객체입니다.
export const api = {
    get:    (endpoint)       => apiClient(endpoint),
    post:   (endpoint, body) => apiClient(endpoint, { method: "POST",   body: JSON.stringify(body) }),
    put:    (endpoint, body) => apiClient(endpoint, { method: "PUT",    body: JSON.stringify(body) }),
    patch:  (endpoint, body) => apiClient(endpoint, { method: "PATCH",  body: JSON.stringify(body) }),
    delete: (endpoint)       => apiClient(endpoint, { method: "DELETE" }),
};
