// 상점 쿠폰 입력 양피지 창 (데스크톱)
// StoreCouponButton이 씀
import { useEffect, useRef } from "react"
import ParchmentTextDialog from "@/shared/ui/dialog/ParchmentTextDialog.jsx"
import InGameParchmentConfirmButton from "@/domains/game/ingame/components/parchment/InGameParchmentConfirmButton.js"
import StoreCouponInput from "@/domains/store/components/StoreCouponInput.jsx"
import {
  COUPON_CANCEL_BTN_ASSET,
  COUPON_DIALOG_ACTIONS_CLASS,
  COUPON_DIALOG_BTN_CLASS,
  COUPON_DIALOG_ERROR_CLASS,
  COUPON_DIALOG_FORM_CLASS,
  COUPON_DIALOG_GUIDE_CLASS,
  COUPON_DIALOG_SUCCESS_CLASS,
  COUPON_DIALOG_TITLE_OFFSET_CLASS,
  COUPON_PARCHMENT_CONTENT_CLASS,
  COUPON_PARCHMENT_FALLBACK_CONTENT_CLASS,
  COUPON_PARCHMENT_FALLBACK_FRAME_CLASS,
  COUPON_PARCHMENT_FRAME_CLASS,
} from "@/domains/store/constants/storeCouponDialogStyle.js"

export default function StoreCouponDialog({ open, onClose, coupon }) {
  const inputRef = useRef(null)

  useEffect(() => {
    if (open) inputRef.current?.focus({ preventScroll: true })
  }, [open])

  return (
    <ParchmentTextDialog
      open={open}
      title="쿠폰 입력"
      onClose={onClose}
      titleClassName={COUPON_DIALOG_TITLE_OFFSET_CLASS}
      frameClassName={COUPON_PARCHMENT_FRAME_CLASS}
      fallbackFrameClassName={COUPON_PARCHMENT_FALLBACK_FRAME_CLASS}
      contentBaseClassName={COUPON_PARCHMENT_CONTENT_CLASS}
      fallbackContentBaseClassName={COUPON_PARCHMENT_FALLBACK_CONTENT_CLASS}
    >
      <form onSubmit={coupon.submit} className={COUPON_DIALOG_FORM_CLASS}>
        <p className={COUPON_DIALOG_GUIDE_CLASS}>
          받은 쿠폰 코드를 넣어주세요. 한 쿠폰은 한 번만 쓸 수 있습니다.
        </p>
        <StoreCouponInput
          inputRef={inputRef}
          name="couponCode"
          value={coupon.code}
          onChange={(e) => coupon.setCode(e.target.value)}
          placeholder="예: WELCOME-2026"
          autoComplete="off"
          maxLength={40}
          aria-label="쿠폰 코드"
          disabled={coupon.loading}
        />
        {coupon.msg ? (
          <p
            role={coupon.msg.type === "error" ? "alert" : "status"}
            className={coupon.msg.type === "error" ? COUPON_DIALOG_ERROR_CLASS : COUPON_DIALOG_SUCCESS_CLASS}
          >
            {coupon.msg.text}
          </p>
        ) : null}
        <div className={COUPON_DIALOG_ACTIONS_CLASS}>
          <InGameParchmentConfirmButton
            type="submit"
            label={coupon.loading ? "확인 중..." : "사용하기"}
            disabled={coupon.loading}
            className={COUPON_DIALOG_BTN_CLASS}
          />
          <InGameParchmentConfirmButton
            label="닫기"
            onClick={onClose}
            sfxKind="ui-cancel"
            assetSrc={COUPON_CANCEL_BTN_ASSET}
            className={COUPON_DIALOG_BTN_CLASS}
          />
        </div>
      </form>
    </ParchmentTextDialog>
  )
}
