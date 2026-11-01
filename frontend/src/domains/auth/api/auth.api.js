// 인증 API 요청 모음 (로그인·가입·이메일 인증·소셜 가입·아이디 찾기·비밀번호 재설정)
// auth 훅들, app/App.jsx(세션 확인), lobby/hooks/useLobbyMenuNav.js(로그아웃)가 사용
import { api } from "@/shared/api/client";

// 이메일·비밀번호 로그인 (로그인 유지 rememberMe도 같이 보냄)
export const loginApi = async (loginData) => {
    return await api.post('/auth/login', loginData);
};

// 일반 가입 (이메일 인증 증명 signupProof 같이 보냄)
export const signupApi = async (signupData) => {
    return await api.post('/auth/signup', signupData);
};

// 가입 이메일 중복 확인 (주소에 든 +·& 안 깨지게 인코딩)
export const checkEmailApi = async (email) => {
    return await api.get(`/auth/check-email?email=${encodeURIComponent(email)}`);
};

// 가입 인증번호 메일 보내기
export const requestSignupCodeApi = async ({ email }) => {
    return await api.post('/auth/signup/email-code', { email });
};

// 인증번호 확인, 맞으면 signupProof 받음
export const verifySignupCodeApi = async ({ email, code }) => {
    return await api.post('/auth/signup/email-code/verify', { email, code });
};

// 지금 세션의 내 계정 (uuid·role)
export const getMeApi = async () => {
    return await api.get('/auth/me');
};

// 로그아웃 요청
export const logoutApi = async () => {
    return await api.post('/auth/logout');
};

// 소셜 첫 로그인 가입 정보(intent) 불러오기, 이메일 인증 필요 여부 받음
export const getSocialSignupIntentApi = async ({ intentToken }) => {
    return await api.post('/auth/social/signup/intent', { intentToken });
};

// 소셜 가입 완료 (인증이 필요했으면 email·signupProof도)
export const completeSocialSignupApi = async ({ intentToken, nickname, birthDate, email, signupProof }) => {
    return await api.post('/auth/social/signup/complete', { intentToken, nickname, birthDate, email, signupProof });
};

// 닉네임·생년월일로 아이디 찾기, 가린 이메일 받음
export const findIdApi = async ({ nickname, birthDate }) => {
    return await api.post('/auth/find-id', { nickname, birthDate });
};

// 비밀번호 재설정 메일 요청
export const requestPasswordResetApi = async ({ email }) => {
    return await api.post('/auth/password-reset/request', { email });
};

// 메일 링크 token이 아직 쓸 수 있는지 확인 (token은 인코딩)
export const verifyPasswordResetApi = async ({ token }) => {
    return await api.get(`/auth/password-reset/verify?token=${encodeURIComponent(token)}`);
};

// token과 새 비밀번호로 재설정 확정
export const confirmPasswordResetApi = async ({ token, newPassword }) => {
    return await api.post('/auth/password-reset/confirm', { token, newPassword });
};
