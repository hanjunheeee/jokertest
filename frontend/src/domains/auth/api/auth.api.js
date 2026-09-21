// 공통 API 클라이언트입니다. 실제 fetch 처리, 에러 처리, 쿠키 포함 설정은 여기 안에 들어 있습니다.
import { api } from "@/shared/api/client";

// 로그인 요청을 보냅니다.
// loginData에는 보통 email/password 같은 로그인 입력값이 들어갑니다.
export const loginApi = async (loginData) => {
    return await api.post('/auth/login', loginData);
};

// 회원가입 요청을 보냅니다.
// signupData에는 회원가입 폼에서 입력한 사용자 정보가 들어갑니다.
export const signupApi = async (signupData) => {
    return await api.post('/auth/signup', signupData);
};

// 가입 입력 단계에서 이메일 중복 여부만 미리 확인합니다. { available: boolean }을 돌려줍니다.
export const checkEmailApi = async (email) => {
    return await api.get(`/auth/check-email?email=${encodeURIComponent(email)}`);
};

// 현재 로그인한 사용자 정보를 조회합니다.
// 쿠키 기반 인증이라 별도 body 없이 GET 요청만 보냅니다.
export const getMeApi = async () => {
    return await api.get('/auth/me');
};

// 로그아웃 요청을 보냅니다.
// 서버에서 인증 쿠키를 제거하거나 세션을 정리하는 용도로 사용합니다.
export const logoutApi = async () => {
    return await api.post('/auth/logout');
};

// F-05: 소셜 로그인 최초 인증 이후, 닉네임 등 필수 정보를 보완해 가입을 완료합니다.
// intentToken은 서버(socialAuth.service.js의 handleOAuthCallback)가 발급한 1회용 값입니다.
export const completeSocialSignupApi = async ({ intentToken, nickname, birthDate }) => {
    return await api.post('/auth/social/signup/complete', { intentToken, nickname, birthDate });
};

// F-29a: 아이디 찾기. 닉네임+생년월일이 실제 계정과 일치하면 마스킹된 이메일 힌트를
// { ok: true, maskedEmail } 형태로 돌려주고, 그 외(불일치/계정 없음/생년월일 미등록)는
// 전부 같은 { ok: false, code: 'NOT_FOUND' }로 응답합니다. 전달 객체를 두 필드로 새로
// 구성해 그 외 값이 실려 나가지 않게 합니다.
export const findIdApi = async ({ nickname, birthDate }) => {
    return await api.post('/auth/find-id', { nickname, birthDate });
};

// F-29c: 비밀번호 재설정 요청 → 링크 검증(비소비 GET) → 새 비밀번호 확정(소비 POST) 세 단계.
// requestPasswordResetApi는 계정 존재 여부와 무관하게 항상 같은 { ok: true } 응답을 받는다
// (backend/controller/passwordReset.controller.js::requestPasswordReset). verifyPasswordResetApi는
// 토큰을 body가 아니라 쿼리로만 전달한다 — 서버가 이 호출로는 토큰을 소비하지 않는다.
export const requestPasswordResetApi = async ({ email }) => {
    return await api.post('/auth/password-reset/request', { email });
};

export const verifyPasswordResetApi = async ({ token }) => {
    return await api.get(`/auth/password-reset/verify?token=${encodeURIComponent(token)}`);
};

export const confirmPasswordResetApi = async ({ token, newPassword }) => {
    return await api.post('/auth/password-reset/confirm', { token, newPassword });
};
