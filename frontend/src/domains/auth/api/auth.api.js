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

// F-31b: 가입 이메일 인증번호를 발송(최초 발송·재발송 공용)합니다. 서버(F-31a
// signupEmailVerification.controller.js)는 { ok:true, resendAfterSec, expiresInSec }
// 또는 { ok:false, code, resendAfterSec? } 형태로 응답합니다. email만 새로 구성해
// 전달하므로 호출한 쪽이 추가 필드를 실어도 서버에 그대로 넘어가지 않습니다.
export const requestSignupCodeApi = async ({ email }) => {
    return await api.post('/auth/signup/email-code', { email });
};

// F-31b: 발송된 인증번호를 확인합니다. 성공하면 { ok:true, signupProof }를 돌려주며,
// signupProof는 이 응답 한 번에만 원문으로 나타납니다(호출한 쪽이 별도 저장소에 남기지
// 않아야 합니다). 실패는 code(CODE_INVALID/CODE_EXPIRED/TOO_MANY_ATTEMPTS)로 구분됩니다.
export const verifySignupCodeApi = async ({ email, code }) => {
    return await api.post('/auth/signup/email-code/verify', { email, code });
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

// F-31: 소셜 가입 보완 화면이 "이 intent가 자체 메일 인증을 요구하는지"를 서버에서 읽어
// 옵니다(비소비 조회). 서버(user.controller.js getSocialSignupIntent)는
// { emailVerificationRequired: boolean }만 돌려주며, 이 값은 화면 분기에만 쓰입니다 —
// 실제 인증 생략 여부는 완료 요청이 잠근 intent로 다시 판정합니다.
export const getSocialSignupIntentApi = async ({ intentToken }) => {
    return await api.post('/auth/social/signup/intent', { intentToken });
};

// F-05: 소셜 로그인 최초 인증 이후, 닉네임 등 필수 정보를 보완해 가입을 완료합니다.
// intentToken은 서버(socialAuth.service.js의 handleOAuthCallback)가 발급한 1회용 값입니다.
//
// F-31 AC-02/AC-03: 제공자가 이메일을 검증해 주지 못한 가입은 자체 메일 인증으로 받은
// email·signupProof를 함께 보냅니다. provider·subject·email_verified·rememberMe 같은
// 권한 주장은 이 요청 객체에 담지 않습니다 — 새 객체를 여기서 직접 구성하므로 호출한 쪽이
// 추가 필드를 실어도 서버에 그대로 넘어가지 않습니다(rememberMe는 서버가 로그인 시작
// 시점에 서명해 둔 쿠키에서만 읽습니다).
export const completeSocialSignupApi = async ({ intentToken, nickname, birthDate, email, signupProof }) => {
    return await api.post('/auth/social/signup/complete', { intentToken, nickname, birthDate, email, signupProof });
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
