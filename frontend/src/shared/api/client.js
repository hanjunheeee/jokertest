import { useAuthStore } from "@/domains/auth/store/authStore";

const BASE_URL = import.meta.env.VITE_API_BASE_URL;

// 공통 뼈대 함수
export const apiClient= async (endpoint, options = {}) => {
    const url = `${BASE_URL}${endpoint}`;

    const defaultOptions = {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: {
            "Content-Type": "application/json",
            ...options.headers,
        },
        ...options,
    };

    const response = await fetch(url, defaultOptions);

    if (response.status === 401) {
        const errorData = await response.json().catch(() => ({}));
        useAuthStore.getState().logout();
        if (window.location.pathname !== '/login') {
            // 인증 만료: 로그인 페이지로 강제 이동
            window.location.replace("/login");
            return;
        }
        // 로그인 페이지에서의 401은 리다이렉트 없이 에러로 던져서
        // 호출부(LoginPage)가 메시지를 직접 처리하도록 함
        throw new Error(errorData.message || "인증에 실패했습니다.");
    }

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "API 요청 중 에러가 발생했습니다.");
    }

    // 표준 응답 포맷 { success: true, data?, message? } 에서 data를 자동 추출
    // data가 없는 응답(메시지 전용)은 본문 그대로 반환해 기존 호출부 코드를 변경하지 않음
    const body = await response.json();
    return body.data !== undefined ? body.data : body;
}

// 메서드별 래퍼(Wrapper) 객체 (실제 프론트엔드에서 사용)
/**
 * @desc    프론트엔드 컴포넌트에서 직관적으로 사용할 수 있도록 API 요청을 캡슐화합니다.
 * @usage   api.get('/users'), api.post('/login', { email, password })
 */
export const api = {
    get: (endpoint) => apiClient(endpoint),
    
    post: (endpoint, body) => apiClient(endpoint, { 
        method: "POST", 
        body: JSON.stringify(body) 
    }),
    
    put: (endpoint, body) => apiClient(endpoint, { 
        method: "PUT", 
        body: JSON.stringify(body) 
    }),
    
    delete: (endpoint) => apiClient(endpoint, { 
        method: "DELETE" 
    })
};