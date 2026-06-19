/**
 * 유저 프로필 · 계정 관리 API
 *
 * - GET   /user/me/profile    내 프로필 + 게임 통계
 * - PATCH /user/me/nickname   닉네임 변경
 * - PATCH /user/me/password   비밀번호 변경 (현재 비밀번호 검증 포함)
 */
import { api } from '@/shared/api/client';

export const getMyProfileApi = async () => {
    return await api.get('/user/me/profile');
};

export const updateNicknameApi = async (nickname) => {
    return await api.patch('/user/me/nickname', { nickname });
};

export const updatePasswordApi = async ({ currentPassword, newPassword }) => {
    return await api.patch('/user/me/password', { currentPassword, newPassword });
};
