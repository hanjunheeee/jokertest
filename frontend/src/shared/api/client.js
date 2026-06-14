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
        useAuthStore.getState().logout();
        if (window.location.pathname !== '/login') {
            window.location.replace("/login");
        }
        return;
    }

    if(!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "API 요청 중 에러가 발생");
    }

    return response.json();
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