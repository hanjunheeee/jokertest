import { api } from "@/shared/api/client";

export const getMyProfileApi = async () => {
    return await api.get('/user/me/profile');
};

export const updateNicknameApi = async (nickname) => {
    return await api.patch('/user/me/nickname', { nickname });
};

export const updatePasswordApi = async ({ currentPassword, newPassword }) => {
    return await api.patch('/user/me/password', { currentPassword, newPassword })
};
