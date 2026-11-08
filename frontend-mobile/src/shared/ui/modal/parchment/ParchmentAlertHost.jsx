// window.alert 대체: 양피지 모달 + 확인 (로그인·가입·공용 로직 alert)
// App.jsx가 마운트, main.jsx가 installParchmentAlert
import { useEffect, useRef, useSyncExternalStore } from "react"
import { getInGameParchmentModalVariant } from "@/domains/game/ingame/constants/parchment/ingameParchmentModalVariants.js"
import ConfirmButton from "@m/shared/ui/modal/parchment/ConfirmButton.jsx"
import ParchmentFrame from "@m/shared/ui/modal/parchment/ParchmentFrame.jsx"
import { PARCHMENT_ALERT_MSG_CLASS } from "@m/shared/ui/modal/parchment/parchmentAlertStyle.js"
import {
  dismissParchmentAlert,
  getParchmentAlertMessage,
  subscribeParchmentAlert,
} from "@m/shared/ui/modal/parchment/parchmentAlert.js"
import SheetPortal from "@m/shared/ui/sheet/SheetPortal.jsx"

const VARIANT = getInGameParchmentModalVariant("gameStartBlocked")
const toFixed = (className) => className.replace(/^absolute /, "fixed ")

export default function ParchmentAlertHost() {
  const message = useSyncExternalStore(subscribeParchmentAlert, getParchmentAlertMessage, () => null)
  const open = Boolean(message)
  const confirmRef = useRef(null)

  useEffect(() => {
    if (open) confirmRef.current?.focus({ preventScroll: true })
  }, [open, message])

  const close = () => dismissParchmentAlert()

  return (
    <SheetPortal open={open} onClose={close}>
      <div key="parchment-alert" data-parchment-alert="">
        <button
          type="button"
          aria-label={VARIANT.backdropLabel}
          className={toFixed(VARIANT.backdropClass)}
          data-sfx-kind="ui-cancel"
          onClick={close}
        />
        <div className={toFixed(VARIANT.wrapClass)}>
          <div role="alertdialog" aria-modal="true" aria-live="assertive" aria-label="안내" className={VARIANT.panelClass}>
            <ParchmentFrame>
              <p className={PARCHMENT_ALERT_MSG_CLASS}>{message}</p>
              <ConfirmButton ref={confirmRef} onClick={close} raised />
            </ParchmentFrame>
          </div>
        </div>
      </div>
    </SheetPortal>
  )
}
