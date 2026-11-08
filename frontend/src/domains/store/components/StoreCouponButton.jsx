// 상점 쿠폰 입력 (보유 재화 아래 "쿠폰 입력" 버튼 → 코드 넣는 창)
// StorePage가 입장 영상 뒤에 씀, 상태는 useCouponRedeem
import { useState } from "react"
import CenterDialog from "@/shared/ui/dialog/CenterDialog.jsx"
import { useCouponRedeem } from "@/domains/store/hooks/useCouponRedeem.js"
import {
  DIALOG_ACTIONS_CLASS, DIALOG_ERROR_CLASS, DIALOG_PRIMARY_BTN_CLASS, DIALOG_SECONDARY_BTN_CLASS, DIALOG_TEXT_CLASS,
} from "@/domains/auth/components/terms/termsStyle.js"

const OPEN_BTN_CLASS =
  "absolute right-[2.5%] top-[calc(2.5%+3.4rem)] z-30 cursor-pointer rounded-md border border-[#8b7355]/50 bg-[#f5f0e6]/84 px-3 py-1 font-subheading app-text-scaled [--app-text-size:clamp(0.7rem,0.9vw,0.82rem)] font-bold text-[#2b1d10] shadow-[0_4px_14px_rgba(26,15,10,0.24)] hover:bg-[#f5f0e6] sm:right-[3%]"
const INPUT_CLASS =
  "w-full rounded border border-[#8b6a3e] bg-white/70 px-3 py-2 font-subheading app-text-scaled [--app-text-size:14px] uppercase tracking-wider text-[#2b1d10] outline-none focus:border-[#5a3a1e]"
const SUCCESS_CLASS = "font-subheading app-text-scaled [--app-text-size:12px] font-bold text-[#2E6B3A]"

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
      <button type="button" className={OPEN_BTN_CLASS} onClick={() => setOpen(true)}>쿠폰 입력</button>
      <CenterDialog open={open} title="쿠폰 입력" onClose={close} labelledBy="coupon-dialog-title">
        <form onSubmit={coupon.submit} className="flex flex-col gap-3">
          <p className={DIALOG_TEXT_CLASS}>받은 쿠폰 코드를 넣어주세요. 한 쿠폰은 한 번만 쓸 수 있습니다.</p>
          <input
            type="text"
            name="couponCode"
            value={coupon.code}
            onChange={(e) => coupon.setCode(e.target.value)}
            placeholder="예: WELCOME-2026"
            autoComplete="off"
            maxLength={40}
            aria-label="쿠폰 코드"
            className={INPUT_CLASS}
          />
          {coupon.msg ? (
            <p role={coupon.msg.type === "error" ? "alert" : "status"} className={coupon.msg.type === "error" ? DIALOG_ERROR_CLASS : SUCCESS_CLASS}>
              {coupon.msg.text}
            </p>
          ) : null}
          <div className={DIALOG_ACTIONS_CLASS}>
            <button type="button" className={DIALOG_SECONDARY_BTN_CLASS} onClick={close}>닫기</button>
            <button type="submit" className={DIALOG_PRIMARY_BTN_CLASS} disabled={coupon.loading}>
              {coupon.loading ? "확인 중..." : "사용하기"}
            </button>
          </div>
        </form>
      </CenterDialog>
    </>
  )
}
