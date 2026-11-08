// 상점 쿠폰 입력 (위 줄 "쿠폰" 버튼 → 코드 넣는 창)
// StoreTopBar가 보유 재화 왼쪽에 씀, 상태는 데스크톱 useCouponRedeem 그대로
import { useState } from "react"
import { useCouponRedeem } from "@/domains/store/hooks/useCouponRedeem.js"
import TextDialog from "@m/shared/ui/modal/TextDialog.jsx"
import {
  DIALOG_ACTIONS_CLASS, DIALOG_ERROR_CLASS, DIALOG_INPUT_CLASS, DIALOG_PRIMARY_BTN_CLASS, DIALOG_SECONDARY_BTN_CLASS,
  DIALOG_SUCCESS_CLASS, DIALOG_TEXT_CLASS,
} from "@m/shared/ui/modal/textDialogStyle.js"

const OPEN_BTN_CLASS =
  "min-h-11 shrink-0 cursor-pointer rounded-md border border-[#8b7355]/50 bg-[#f5f0e6]/84 px-2.5 font-subheading font-bold text-[#2b1d10] app-text-scaled [--app-text-size:0.8rem] active:scale-95"

export default function CouponButton() {
  const [open, setOpen] = useState(false)
  const coupon = useCouponRedeem()
  const close = () => {
    setOpen(false)
    coupon.reset()
  }

  return (
    <>
      <button type="button" className={OPEN_BTN_CLASS} onClick={() => setOpen(true)}>쿠폰</button>
      <TextDialog open={open} title="쿠폰 입력" onClose={close}>
        <form onSubmit={coupon.submit} className="flex flex-col gap-3">
          <p className={DIALOG_TEXT_CLASS}>받은 쿠폰 코드를 넣어주세요. 한 쿠폰은 한 번만 쓸 수 있습니다.</p>
          <input
            type="text"
            name="couponCode"
            value={coupon.code}
            onChange={(e) => coupon.setCode(e.target.value)}
            placeholder="예: WELCOME-2026"
            autoComplete="off"
            autoCapitalize="characters"
            maxLength={40}
            aria-label="쿠폰 코드"
            className={DIALOG_INPUT_CLASS}
          />
          {coupon.msg ? (
            <p role={coupon.msg.type === "error" ? "alert" : "status"} className={coupon.msg.type === "error" ? DIALOG_ERROR_CLASS : DIALOG_SUCCESS_CLASS}>
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
      </TextDialog>
    </>
  )
}
