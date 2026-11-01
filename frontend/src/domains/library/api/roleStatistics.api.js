// 직업 전적·숙련도 랭킹 HTTP 요청
// 직업 통계 스토어(roleStatistics.store.js)가 씀
import { api } from "@/shared/api/client";

// 내 직업별 전적 목록 받기
export const getMyRoleStatisticsApi = async () => {
  return await api.get("/user/me/role-statistics");
};

// 한 직업 숙련도 랭킹 받기, 역할 코드는 주소에 맞게 인코딩
export const getRoleRankingApi = async (role) => {
  return await api.get(`/user/role-statistics/ranking?role=${encodeURIComponent(role)}`);
};
