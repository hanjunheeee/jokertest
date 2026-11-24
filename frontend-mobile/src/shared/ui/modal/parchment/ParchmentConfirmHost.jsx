// window.confirm 대체: 양피지 확인·취소 (방 삭제 등 appConfirm)
// App.jsx가 마운트, main.jsx가 installParchmentConfirm
import { useEffect, useRef, useSyncExternalStore } from "react"
import { getInGameParchmentModalVariant } from "@/domains/game/ingame/constants/parchment/ingameParchmentModalVariants.js"
import { MODAL_ASSETS } from "@/domains/game/matching/constants/friendInviteModalAssets.js"
import ConfirmButton from "@m/shared/ui/modal/parchment/ConfirmButton.jsx"
import ParchmentFrame from "@m/shared/ui/modal/parchment/ParchmentFrame.jsx"
import { PARCHMENT_CONFIRM_MSG_CLASS } from "@m/shared/ui/modal/parchment/parchmentAlertStyle.js"
import {
  getParchmentConfirmState,
  resolveParchmentConfirm,
  subscribeParchmentConfirm,
} from "@m/shared/ui/modal/parchment/parchmentConfirm.js"
import SheetPortal from "@m/shared/ui/sheet/SheetPortal.jsx"

const VARIANT = getInGameParchmentModalVariant("gameStartBlocked")
const toFixed = (className) => className.replace(/^absolute /, "fixed ")

export default function ParchmentConfirmHost() {
  const pending = useSyncExternalStore(subscribeParchmentConfirm, getParchmentConfirmState, () => null)
  const open = Boolean(pending)
  const confirmRef = useRef(null)

  useEffect(() => {
    if (open) confirmRef.current?.focus({ preventScroll: true })
  }, [open, pending?.message])

  const cancel = () => resolveParchmentConfirm(false)
  const confirm = () => resolveParchmentConfirm(true)

  return (
    <SheetPortal open={open} onClose={cancel}>
      <div key="parchment-confirm" data-parchment-confirm="" className="overflow-x-hidden overflow-y-hidden">
        <button
          type="button"
          aria-label={VARIANT.backdropLabel}
          className={toFixed(VARIANT.backdropClass)}
          data-sfx-kind="ui-cancel"
          onClick={cancel}
        />
        <div className={toFixed(VARIANT.wrapClass)}>
          <div
            role="alertdialog"
            aria-modal="true"
            aria-label="확인"
            className={`${VARIANT.panelClass} min-w-0 max-w-full overflow-x-hidden overflow-y-hidden`}
          >
            <ParchmentFrame scrollContent={false} contentClassName="gap-1.5 land:gap-1">
              <div className="flex w-full min-w-0 max-w-full translate-x-[0.4rem] flex-col items-center gap-1.5 land:translate-x-[0.3rem] land:gap-1">
                <p className={PARCHMENT_CONFIRM_MSG_CLASS}>{pending?.message}</p>
                <div className="flex w-full min-w-0 max-w-full flex-wrap items-center justify-center gap-x-2 gap-y-2">
                  <ConfirmButton ref={confirmRef} label="확인" onClick={confirm} raised buttonClassName="!w-[7.1rem]" />
                  <ConfirmButton
                    label="취소"
                    onClick={cancel}
                    raised
                    sfxKind="ui-cancel"
                    src={MODAL_ASSETS.cancelButton}
                    buttonClassName="!w-[7.1rem]"
                  />
                </div>
              </div>
            </ParchmentFrame>
          </div>
        </div>
      </div>
    </SheetPortal>
  )
}