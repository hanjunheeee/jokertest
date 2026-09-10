import { handleApiResponse } from "./response.js";
// import.meta.env(Vite 빌드타임 치환)는 env.js 한 곳에만 모아둔다 — 그래야 node:test의
// mock.module로 이 모듈만 갈아끼워 client.js 자체는 실제 코드로 테스트할 수 있다(상대
// 경로라야 mock.module이 별도 리졸버 없이 특정할 수 있다. "@/..." 별칭은 Vite 전용이라
// 플레인 Node에서 해석되지 않는다. F-03 R-IMPL #6).
import { API_BASE_URL } from "../env.js";

// Vite 환경변수에 설정된 백엔드 API 기본 주소입니다.
// 예: VITE_API_BASE_URL=http://localhost:4000
const BASE_URL = API_BASE_URL;

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

// 액세스 토큰 만료(F-03)로 401을 받은 요청들이 동시에 갱신을 시도하면 회전형 갱신 자격이
// 불필요하게 여러 번 회전합니다(A-07). 진행 중인 갱신 요청 하나를 여기 보관해 모든 호출이
// 같은 결과를 공유하게 합니다. useSocket.js도 소켓 재인증에 이 함수를 그대로 재사용합니다.
let refreshPromise = null;

export const refreshAccessToken = () => {
    if (!refreshPromise) {
        refreshPromise = fetch(`${BASE_URL}/auth/refresh`, {
            method:      "POST",
            credentials: "include",
            cache:       "no-store",
        })
            .then((response) => response.ok)
            .catch(() => false)
            .finally(() => { refreshPromise = null; });
    }
    return refreshPromise;
};

// fetch를 감싼 공통 API 요청 함수입니다.
// endpoint는 "/users/me" 같은 API 경로이고, options는 fetch 옵션입니다.
// _isRetry는 갱신 후 재시도 호출임을 표시하는 내부 플래그로, 호출하는 쪽에서 넘길 값이
// 아닙니다 — 이게 없으면 갱신 자체가 실패했을 때 재시도가 무한히 반복될 수 있습니다.
export const apiClient = async (endpoint, options = {}, _isRetry = false) => {
    // 기본 API 주소와 endpoint를 합쳐 실제 요청 URL을 만듭니다.
    const url = `${BASE_URL}${endpoint}`;
    const requestOptions = createRequestOptions(options);

    // 실제 HTTP 요청을 보냅니다.
    const response = await fetch(url, requestOptions);

    // "액세스 토큰이 만료됐을 뿐"인 401만 갱신 대상입니다. 로그아웃·정지·재사용 감지 같은
    // 다른 401은 그대로 handleApiResponse로 흘려보내 즉시 로그아웃 처리되게 둡니다 — 갱신을
    // 시도해도 성공할 수 없는 상황에서 재시도를 반복하지 않기 위함입니다.
    if (response.status === 401 && !_isRetry && endpoint !== "/auth/refresh") {
        const body = await response.clone().json().catch(() => ({}));
        if (body.code === "ACCESS_TOKEN_EXPIRED") {
            const refreshed = await refreshAccessToken();
            if (refreshed) {
                return apiClient(endpoint, options, true);
            }
        }
    }

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
