import { api } from "@/shared/api/client";

export const getMyRoleStatisticsApi = async () => {
  return await api.get("/user/me/role-statistics");
};

export const getRoleRankingApi = async (role) => {
  return await api.get(`/user/role-statistics/ranking?role=${encodeURIComponent(role)}`);
};
