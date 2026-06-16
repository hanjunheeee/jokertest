import { api } from '@/shared/api/client';

/**
 * @desc    로그인 API
 * 클라이언트에서 입력받은 이메일/비밀번호를 서버로 전송합니다.
 * @param   {Object} loginData - { email, password }
 * @returns {Promise<Object>} 성공 시 유저 정보와 토큰 반환
 */
export const loginApi = async (loginData) => {
  return await api.post('/auth/login', loginData);
}

/**
 * @desc    회원가입 API
 * 신규 유저의 가입 정보를 서버로 전송합니다
 * @param   {Object} signupData - { login_id, email, password, nickname }
 * @returns {Promise<Object>} 성공 시 생성된 유저 데이터 반환
 */
export const signupApi = async (signupData) => {
  return await api.post('/auth/signup', signupData);
}

export const getMeApi = async () => {
  return await api.get('/auth/me');
}