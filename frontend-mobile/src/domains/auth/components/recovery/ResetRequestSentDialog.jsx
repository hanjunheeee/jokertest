// 재설정 링크 접수 안내: 양피지 + 확인·다시 보내기 (입력 화면은 그대로)
// PasswordResetRequestPage.jsx가 status=sent 일 때 씀
import { useEffect, useRef } from "react"
import { REQUEST_TEXT } from "@/domains/auth/constants/recoveryMessages.js"
import { EMOTICON_PALETTE_ASSETS } from "@/domains/user/constants/emoticonPaletteAssets.js"
import { getInGameParchmentModalVariant } from "@/domains/game/ingame/constants/parchment/ingameParchmentModalVariants.js"
import ConfirmButton from "@m/shared/ui/modal/parchment/ConfirmButton.jsx"
import ParchmentFrame from "@m/shared/ui/modal/parchment/ParchmentFrame.jsx"
import { PARCHMENT_ALERT_MSG_CLASS } from "@m/shared/ui/modal/parchment/parchmentAlertStyle.js"
import SheetPortal from "@m/shared/ui/sheet/SheetPortal.jsx"

const VARIANT = getInGameParchmentModalVariant("gameStartBlocked")
const toFixed = (className) => className.replace(/^absolute /, "fixed ")
const COMPACT_BTN = "!w-[6.6rem]"
const COMPACT_LABEL = "px-0.5 !text-[0.84rem] leading-none whitespace-nowrap"

export default function ResetRequestSentDialog({ open, onConfirm, onResend, resendDisabled = false }) {
  const confirmRef = useRef(null)

  useEffect(() => {
    if (open) confirmRef.current?.focus({ preventScroll: true })
  }, [open])

  // 확인은 닫기만, 다시 보내기는 재요청 (배경·Esc로 닫지 않음 — 의도적 확인 필요)
  return (
    <SheetPortal open={open} onClose={null} escSfx={false}>
      <div key="reset-request-sent" data-reset-request-sent="">
        <div className={toFixed(VARIANT.backdropClass)} aria-hidden="true" />
        <div className={toFixed(VARIANT.wrapClass)}>
          <div role="dialog" aria-modal="true" aria-live="polite" aria-label="재설정 요청 접수" className={VARIANT.panelClass}>
            <ParchmentFrame>
              <p className={PARCHMENT_ALERT_MSG_CLASS}>{REQUEST_TEXT.sent}</p>
              <div className="mt-0.5 flex w-full max-w-full flex-row flex-nowrap items-center justify-center gap-1">
                <ConfirmButton
                  ref={confirmRef}
                  label="확인"
                  onClick={onConfirm}
                  buttonClassName={COMPACT_BTN}
                  labelClassName={COMPACT_LABEL}
                />
                <ConfirmButton
                  label="다시 보내기"
                  src={EMOTICON_PALETTE_ASSETS.cancelButton}
                  onClick={onResend}
                  disabled={resendDisabled}
                  sfxKind="ui-cancel"
                  buttonClassName={COMPACT_BTN}
                  labelClassName={COMPACT_LABEL}
                />
              </div>
            </ParchmentFrame>
          </div>
        </div>
      </div>
    </SheetPortal>
  )
}
