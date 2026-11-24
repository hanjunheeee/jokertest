// 상점 쿠폰 입력 (하단 줄 쿠폰 그림 버튼 → 코드 넣는 창)
// StoreTopBar가 보유 재화 오른쪽에 씀, 상태는 데스크톱 useCouponRedeem 그대로
import { useState } from "react"
import { useCouponRedeem } from "@/domains/store/hooks/useCouponRedeem.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { STORE_MOBILE_ASSETS } from "../../constants/storeMobileAssets.js"
import CouponDialog from "./CouponDialog.jsx"

const OPEN_BTN_CLASS =
  "relative block h-9 shrink-0 cursor-pointer border-0 bg-transparent p-0 leading-none transition-transform active:scale-95 land:h-10"

const OPEN_BTN_IMG_CLASS =
  "block h-9 w-auto max-w-[3rem] select-none object-contain object-center land:h-10 land:max-w-[3.5rem]"

export default function CouponButton() {
  const [open, setOpen] = useState(false)
  const coupon = useCouponRedeem()
  const close = () => {
    setOpen(false)
    coupon.reset()
  }

  return (
    <>
      <button type="button" aria-label="쿠폰" className={OPEN_BTN_CLASS} onClick={() => setOpen(true)}>
        <PublicAsset src={STORE_MOBILE_ASSETS.couponButton} alt="" className={OPEN_BTN_IMG_CLASS} draggable={false} />
      </button>
      <CouponDialog open={open} onClose={close} coupon={coupon} />
    </>
  )
}
