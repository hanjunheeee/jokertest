import { api } from "@/shared/api/client";

export const loginApi = async (loginData) => {
    return await api.post('/auth/login', loginData);
};

export const signupApi = async (signupData) => {
    return await api.post('/auth/signup', signupData);
};

export const checkEmailApi = async (email) => {
    return await api.get(`/auth/check-email?email=${encodeURIComponent(email)}`);
};

export const requestSignupCodeApi = async ({ email }) => {
    return await api.post('/auth/signup/email-code', { email });
};

export const verifySignupCodeApi = async ({ email, code }) => {
    return await api.post('/auth/signup/email-code/verify', { email, code });
};

export const getMeApi = async () => {
    return await api.get('/auth/me');
};

export const logoutApi = async () => {
    return await api.post('/auth/logout');
};

export const getSocialSignupIntentApi = async ({ intentToken }) => {
    return await api.post('/auth/social/signup/intent', { intentToken });
};

export const completeSocialSignupApi = async ({ intentToken, nickname, birthDate, email, signupProof }) => {
    return await api.post('/auth/social/signup/complete', { intentToken, nickname, birthDate, email, signupProof });
};

export const findIdApi = async ({ nickname, birthDate }) => {
    return await api.post('/auth/find-id', { nickname, birthDate });
};

export const requestPasswordResetApi = async ({ email }) => {
    return await api.post('/auth/password-reset/request', { email });
};

export const verifyPasswordResetApi = async ({ token }) => {
    return await api.get(`/auth/password-reset/verify?token=${encodeURIComponent(token)}`);
};

export const confirmPasswordResetApi = async ({ token, newPassword }) => {
    return await api.post('/auth/password-reset/confirm', { token, newPassword });
};
