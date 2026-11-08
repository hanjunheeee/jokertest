// 쿠폰 입력 상태 (코드 칸·보내기·결과 문구, 성공하면 보유 재화 다시 불러오기)
// 데스크톱 상점 쿠폰 창·모바일 상점 쿠폰 시트가 씀
import { useRef, useState } from "react"
import { redeemCouponApi } from "../api/coupon.api.js"
import { useEconomyStore } from "../../economy/store/economy.store.js"
import { couponErrorText, couponSuccessText, isCouponCodeShape, normalizeCouponCode } from "../utils/coupon.js"

export function useCouponRedeem({
  redeem = redeemCouponApi,
  refreshWallet = () => useEconomyStore.getState().fetchSummary?.(),
} = {}) {
  const [code, setCode] = useState("")
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState(null)
  const busyRef = useRef(false)

  const submit = async (event) => {
    event?.preventDefault?.()
    if (busyRef.current) return
    if (!isCouponCodeShape(code)) {
      setMsg({ type: "error", text: "쿠폰 코드는 영문·숫자·- 4~40자입니다." })
      return
    }
    busyRef.current = true
    setLoading(true)
    try {
      const result = await redeem(normalizeCouponCode(code))
      setMsg({ type: "success", text: couponSuccessText(result?.reward) })
      setCode("")
      await Promise.resolve(refreshWallet()).catch(() => {})
    } catch (error) {
      setMsg({ type: "error", text: couponErrorText(error) })
    } finally {
      busyRef.current = false
      setLoading(false)
    }
  }

  // 창 닫을 때 문구 지움
  const reset = () => {
    setCode("")
    setMsg(null)
  }

  return { code, setCode, loading, msg, submit, reset }
}
