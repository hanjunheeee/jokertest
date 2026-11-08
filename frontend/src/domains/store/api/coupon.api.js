// 쿠폰 사용 요청 (코드 하나 → 보상 재화·양·남은 잔액)
// 쿠폰 입력 훅(useCouponRedeem)이 씀, 데스크톱·모바일 같이
import { api } from "../../../shared/api/client.js"

// → { ok, redemptionId, code, reward: { currency, amount }, balanceAfter }
export const redeemCouponApi = async (code) => {
  return await api.post("/economy/coupons/redeem", { code })
}
