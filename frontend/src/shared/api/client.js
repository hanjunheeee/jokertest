/**
 * @file client.js
 * @desc Fetch 기반 HTTP 클라이언트. 401 자동 로그아웃, { success, data } 응답 자동 언래핑을 처리합니다.
 *
 * axios의 interceptor처럼, 매 요청/응답마다 공통으로 필요한 처리(인증 쿠키 포함,
 * 401 발생 시 자동 로그아웃, 에러 응답을 예외로 변환, 성공 응답 언래핑)를 apiClient
 * 함수 하나에 모아둡니다. 이 덕분에 각 도메인의 api 호출 코드는 성공 케이스만 신경 쓰면 됩니다.
 */

import { useAuthStore } from "@/domains/auth/store/authStore";

// 모든 API 요청의 기준이 되는 서버 주소 (.env의 VITE_API_BASE_URL)
const BASE_URL = import.meta.env.VITE_API_BASE_URL;

/**
 * 공통 HTTP 요청 함수.
 * @param {string} endpoint - BASE_URL 이후의 경로 (e.g. '/auth/login')
 * @param {RequestInit} [options={}]
 * @returns {Promise<any>} 응답 body.data (data 키가 없으면 body 전체 반환)
 * @throws {Error} 4xx/5xx 응답 또는 네트워크 오류
 */
export const apiClient = async (endpoint, options = {}) => {
    const url = `${BASE_URL}${endpoint}`;

    // 기본 옵션 + 호출부가 넘긴 options를 병합.
    // credentials: "include" — 로그인 세션 쿠키(HttpOnly)를 요청에 함께 실어 보냄
    // cache: "no-store" — 인증/상태 관련 응답을 브라우저가 캐시하지 않도록 강제
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
            window.location.replace("/login");
            return;
        }
        // /login 페이지에서의 401 — 리다이렉트 없이 throw해서 호출부(LoginPage)가 메시지를 처리하도록 함
        throw new Error(errorData.message || "인증에 실패했습니다.");
    }

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "API 요청 중 에러가 발생했습니다.");
    }

    // { success: true, data: ... } 포맷에서 data를 자동 추출 — 기존 호출부 코드 변경 불필요
    const body = await response.json();
    return body.data !== undefined ? body.data : body;
};

/**
 * HTTP 메서드별 래퍼.
 * @example api.get('/users'), api.post('/login', { email, password })
 */
export const api = {
    get:    (endpoint)       => apiClient(endpoint),
    post:   (endpoint, body) => apiClient(endpoint, { method: "POST",   body: JSON.stringify(body) }),
    put:    (endpoint, body) => apiClient(endpoint, { method: "PUT",    body: JSON.stringify(body) }),
    patch:  (endpoint, body) => apiClient(endpoint, { method: "PATCH",  body: JSON.stringify(body) }),
    delete: (endpoint)       => apiClient(endpoint, { method: "DELETE" }),
};
