// 공통 API 클라이언트를 재사용합니다. 쿠키 포함 요청, 401 갱신, 에러 처리는 client.js가 맡습니다.
import { api } from "@/shared/api/client";

// 로그인한 계정의 직업별(5개 고정) 전적을 조회합니다.
export const getMyRoleStatisticsApi = async () => {
  return await api.get("/user/me/role-statistics");
};

// 한 직업의 전체 적격(최소 10판) 사용자 랭킹을 조회합니다.
export const getRoleRankingApi = async (role) => {
  return await api.get(`/user/role-statistics/ranking?role=${encodeURIComponent(role)}`);
};
