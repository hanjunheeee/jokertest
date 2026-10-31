import { api } from "@/shared/api/client";

export const getMyAchievementsApi = async () => {
  return await api.get("/user/me/achievements");
};
