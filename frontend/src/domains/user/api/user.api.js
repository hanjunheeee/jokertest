// 내 계정 HTTP 요청 (프로필·닉네임·비밀번호)
// 프로필 스토어·닉네임/비밀번호 폼 훅·App.jsx(세션 시작)·시험이 씀
import { api } from "@/shared/api/client";

// 내 프로필 (닉네임·전적)
export const getMyProfileApi = async () => {
    return await api.get('/user/me/profile');
};

// 닉네임 바꾸기
export const updateNicknameApi = async (nickname) => {
    return await api.patch('/user/me/nickname', { nickname });
};

// 비밀번호 바꾸기 (지금 비밀번호를 같이 보냄)
// 서버가 지금 비밀번호 틀림을 401로 답해 공통 처리로 넘기면 로그아웃되고 "변경됨"이 뜸(known 1-4) → 오류로 받음
export const updatePasswordApi = async ({ currentPassword, newPassword }) => {
    return await api.patch('/user/me/password', { currentPassword, newPassword }, { unauthorizedInline: true })
};
