// 공통 API 클라이언트입니다. 쿠키 포함 요청, 에러 처리, 응답 파싱은 이 안에서 처리합니다.
import { api } from "@/shared/api/client";

// 현재 로그인한 사용자의 프로필 정보를 조회합니다.
export const getMyProfileApi = async () => {
    return await api.get('/user/me/profile');
};

// 현재 로그인한 사용자의 닉네임을 변경합니다.
// 서버에는 { nickname: "새 닉네임" } 형태로 보냅니다.
export const updateNicknameApi = async (nickname) => {
    return await api.patch('/user/me/nickname', { nickname });
};

// 현재 비밀번호와 새 비밀번호를 보내 비밀번호 변경을 요청합니다.
// 인자는 { currentPassword, newPassword } 형태의 객체로 받습니다.
export const updatePasswordApi = async ({ currentPassword, newPassword }) => {
    return await api.patch('/user/me/password', { currentPassword, newPassword })
};
