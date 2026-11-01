// 지갑·보유 아이템 조회와 아이템 구매·장착 HTTP 요청
// 경제 스토어의 요약·구매·장착 액션과 장착 저장(loadoutWrite.js)이 씀
import { api } from "../../../shared/api/client.js"

export const economyApi = {
  // 골드·다이아 잔액
  wallet: (userId) => api.get(`/economy/accounts/${userId}/wallet`),
  // 보유 목록과 함께 지금 장착 상태(loadout)도 옴
  entitlements: (userId) => api.get(`/economy/accounts/${userId}/entitlements`),
  // 아이템 하나 구매, 같은 구매 id면 서버가 한 번만 처리
  purchase: (body) => api.post("/economy/purchase", body),
  // 칸 하나 장착
  equip: (body) => api.post("/economy/equip", body),
  // 프로필 사진·테두리 한 번에 장착
  equipProfile: (body) => api.post("/economy/equip-profile", body),
}
