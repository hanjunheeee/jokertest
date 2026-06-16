/**
 * @file auth.js
 * @desc 인증 관련 API 함수 (로그인 · 회원가입 · 세션 검증)
 */

import { api } from '@/shared/api/client';

/**
 * @param {Object} loginData - { email, password }
 * @returns {Promise<{ user: Object }>}
 */
export const loginApi = async (loginData) => {
    return await api.post('/auth/login', loginData);
};

/**
 * @param {Object} signupData - { email, password, nickname }
 * @returns {Promise<void>}
 */
export const signupApi = async (signupData) => {
    return await api.post('/auth/signup', signupData);
};

/**
 * 쿠키 유효성을 서버에서 검증합니다. 앱 마운트 시 Zustand 상태를 동기화하는 데 사용됩니다.
 * @returns {Promise<{ uuid: string, role: string }>}
 */
export const getMeApi = async () => {
    return await api.get('/auth/me');
};
