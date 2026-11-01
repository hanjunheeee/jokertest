// 움직이는 양피지 창: 펼침·확대 움직임 있는 뒤 막·창·확인 버튼
// 역할 공개 창·밤 차례 안내 창이 사용, 모양은 constants/parchment/의 variant
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { useEffect } from "react"
import { dispatchUiSfx } from "../../../../../shared/hooks/useSfxRuntime.js"
import { PARCHMENT_CONFIRM_LABEL } from "../../constants/parchment/ingameParchmentConfirmButton.js"
import { getMotionPreset } from "../../constants/parchment/ingameParchmentModalMotion.js"
import { getInGameParchmentModalVariant } from "../../constants/parchment/ingameParchmentModalVariants.js"
import InGameParchmentConfirmButton from "./InGameParchmentConfirmButton.js"
import InGameParchmentPanel from "./InGameParchmentPanelBase.js"

// 열렸을 때 Esc로 닫기 (ModalBase에도 같은 훅이 따로 있음)
function useParchmentModalEscape(onDismiss, open) {
  useEffect(() => {
    if (!open || !onDismiss) return undefined

    const onKeyDown = (event) => {
      if (event.key !== "Escape") return
      dispatchUiSfx("ui-cancel", event)
      onDismiss()
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [open, onDismiss])
}

// 열림 따라 들어오고 나가는 움직임, 움직임 줄이기 설정이면 짧게
export default function InGameParchmentModalAnimated({
  open,
  variantKey,
  onDismiss,
  confirmLabel = PARCHMENT_CONFIRM_LABEL,
  parchmentProps = {},
  wrapProps = {},
  children,
}) {
  const prefersReducedMotion = useReducedMotion()
  const variant = getInGameParchmentModalVariant(variantKey)
  const motionPreset = getMotionPreset(variant.animation)

  useParchmentModalEscape(onDismiss, open)

  // 움직임 없는 variant를 이 창에 넘기면 바로 오류로 알림
  if (!motionPreset) {
    throw new Error(`Animated parchment modal requires animation variant: ${variantKey}`)
  }

  const transition = prefersReducedMotion
    ? motionPreset.reducedTransition
    : motionPreset.transition
  const panelInitial = motionPreset.getPanelInitial(prefersReducedMotion)
  const panelAnimate = motionPreset.getPanelAnimate(prefersReducedMotion)
  const panelExit = motionPreset.getPanelExit(prefersReducedMotion)

  // 창 안 누름은 뒤 막 닫기로 번지지 않게 막음, onDismiss 없으면 확인 버튼 없음
  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            type="button"
            aria-label={variant.backdropLabel}
            className={variant.backdropClass}
            data-sfx-kind="ui-cancel"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={transition}
            onClick={onDismiss}
          />

          <div className={variant.wrapClass} {...wrapProps}>
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={variant.dialogLabel}
              className={variant.panelClass}
              style={{ transformOrigin: motionPreset.transformOrigin }}
              initial={panelInitial}
              animate={panelAnimate}
              exit={panelExit}
              transition={transition}
              onClick={(event) => event.stopPropagation()}
            >
              <InGameParchmentPanel
                frameClassName={variant.parchmentFrameClass}
                fallbackFrameClassName={variant.parchmentFallbackFrameClass}
                contentClassName={variant.parchmentContentClass}
                {...parchmentProps}
              >
                {children}
                {onDismiss ? (
                  <InGameParchmentConfirmButton
                    label={confirmLabel}
                    onClick={onDismiss}
                    className={variant.confirmButtonClass}
                  />
                ) : null}
              </InGameParchmentPanel>
            </motion.div>
          </div>
        </>
      ) : null}
    </AnimatePresence>
  )
}
