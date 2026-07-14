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
