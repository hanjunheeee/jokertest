// 공통 API 클라이언트를 재사용합니다. 쿠키 포함 요청, 401 갱신, 에러 처리는 client.js가 맡습니다.
import { api } from "@/shared/api/client";

// 로그인한 계정의 22개 업적(금지된 기록 7 + 직업 도전과제 15) 진행률·달성 상태를 조회합니다.
export const getMyAchievementsApi = async () => {
  return await api.get("/user/me/achievements");
};
