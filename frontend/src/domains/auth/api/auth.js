/**
 * 인증 API — LoginPage·App에서 호출
 * 세션 쿠키는 shared/api/client.js의 credentials: "include"로 전송
 *
 * - POST /auth/login — 로그인, { user } 반환 → authStore.login
 * - POST /auth/signup — 회원가입 (nickname 포함)
 * - GET /auth/me — 쿠키 유효성·현재 사용자 (앱 마운트·LoginPage 세션 복구)
 */
import { api } from '@/shared/api/client';

/** 이메일·비밀번호로 로그인 — 성공 시 { user } */
export const loginApi = async (loginData) => {
    return await api.post('/auth/login', loginData);
};

/** 이메일·비밀번호·닉네임으로 회원가입 */
export const signupApi = async (signupData) => {
    return await api.post('/auth/signup', signupData);
};

/** 서버에 세션(쿠키) 검증 요청 — 유효하면 사용자 정보, 401이면 client가 logout 처리 */
export const getMeApi = async () => {
    return await api.get('/auth/me');
};
