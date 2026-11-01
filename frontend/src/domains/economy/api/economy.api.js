// 지갑·보유 아이템 조회와 아이템 구매·장착 HTTP 요청
// 경제 스토어의 요약·구매·장착 액션이 씀
import { api } from "../../../shared/api/client.js"

export const economyApi = {
  wallet: (userId) => api.get(`/economy/accounts/${userId}/wallet`),
  // 보유 목록과 함께 지금 장착 상태(loadout)도 옴
  entitlements: (userId) => api.get(`/economy/accounts/${userId}/entitlements`),
  purchase: (body) => api.post("/economy/purchase", body),
  equip: (body) => api.post("/economy/equip", body),
  equipProfile: (body) => api.post("/economy/equip-profile", body),
}
