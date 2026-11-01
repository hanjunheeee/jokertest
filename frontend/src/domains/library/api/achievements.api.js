// 내 업적 목록 HTTP 요청
// 업적 스토어(achievements.store.js)·직업 통계 스토어가 씀
import { api } from "@/shared/api/client";

// 내 업적 상태 전부 받기 (이룸·보상 받음·현재/목표)
export const getMyAchievementsApi = async () => {
  return await api.get("/user/me/achievements");
};
