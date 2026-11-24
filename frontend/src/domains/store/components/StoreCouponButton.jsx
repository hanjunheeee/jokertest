// 상점 쿠폰 입력 (보유 재화 아래 "쿠폰 입력" 버튼 → 코드 넣는 창)
// StorePage가 입장 영상 뒤에 씀, 상태는 useCouponRedeem
import { useState } from "react"
import { useCouponRedeem } from "@/domains/store/hooks/useCouponRedeem.js"
import StoreCouponDialog from "@/domains/store/components/StoreCouponDialog.jsx"

const OPEN_BTN_CLASS =
  "absolute right-[2.5%] top-[calc(2.5%+3.4rem)] z-30 cursor-pointer rounded-md border border-[#8b7355]/50 bg-[#f5f0e6]/84 px-3 py-1 font-subheading app-text-scaled [--app-text-size:clamp(0.7rem,0.9vw,0.82rem)] font-bold text-[#2b1d10] shadow-[0_4px_14px_rgba(26,15,10,0.24)] hover:bg-[#f5f0e6] sm:right-[3%]"

export default function StoreCouponButton({ visible = true }) {
  const [open, setOpen] = useState(false)
  const coupon = useCouponRedeem()
  if (!visible) return null

  const close = () => {
    setOpen(false)
    coupon.reset()
  }

  return (
    <>
      <button type="button" className={OPEN_BTN_CLASS} onClick={() => setOpen(true)}>
        쿠폰 입력
      </button>
      <StoreCouponDialog open={open} onClose={close} coupon={coupon} />
    </>
  )
}
