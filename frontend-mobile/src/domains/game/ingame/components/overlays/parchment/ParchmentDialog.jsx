// 연출 양피지 창: 화면 덮개 + 가운데 양피지 + 확인 버튼, 펼침·커지기 움직임 고름
// 역할 공개·단계 입장·밤 차례·밤 개인 결과·밤 성공 창이 씀 (덮개 짙기·z순서·움직임·이름은 데스크톱 variant 그대로)
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { useEffect, useRef } from "react"
import { dispatchUiSfx } from "@/shared/hooks/useSfxRuntime.js"
import {
    CONFIRM_BTN_CLASS_RAISED_FOCUS,
    PARCHMENT_CONFIRM_LABEL,
} from "@/domains/game/ingame/constants/parchment/ingameParchmentConfirmButton.js"
import { getMotionPreset } from "@/domains/game/ingame/constants/parchment/ingameParchmentModalMotion.js"
import { getInGameParchmentModalVariant } from "@/domains/game/ingame/constants/parchment/ingameParchmentModalVariants.js"
import ConfirmButton from "./ConfirmButton.jsx"
import ParchmentFrame from "./ParchmentFrame.jsx"

// 열렸을 때 Esc로 닫기 (데스크톱과 같음)
function useEscape(onDismiss, open) {
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

// 움직임 없는 창은 바로 뜨고 바로 사라짐 (단계 입장·밤 결과는 데스크톱도 움직임 없음)
const NO_MOTION = {
    transition: { duration: 0 },
    reducedTransition: { duration: 0 },
    transformOrigin: "center",
    getPanelInitial: () => false,
    getPanelAnimate: () => ({ opacity: 1 }),
    getPanelExit: () => ({ opacity: 0 }),
}

// variantKey는 데스크톱 양피지 variant 이름, 덮개 누름·Esc·확인 모두 onDismiss
export default function ParchmentDialog({
    open,
    variantKey,
    onDismiss,
    confirmLabel = PARCHMENT_CONFIRM_LABEL,
    showConfirm = true,
    focusKey,
    wrapperProps = {},
    children,
}) {
    const reduced = useReducedMotion()
    const variant = getInGameParchmentModalVariant(variantKey)
    const preset = getMotionPreset(variant.animation) ?? NO_MOTION
    const transition = reduced ? preset.reducedTransition : preset.transition
    // 데스크톱 버튼 간격 두 가지 (띄움 = 단계 입장·밤 결과, 붙임 = 역할 공개·밤 차례)
    const raised = variant.confirmButtonClass === CONFIRM_BTN_CLASS_RAISED_FOCUS
    const confirmRef = useRef(null)

    useEscape(onDismiss, open)

    // 바로 뜨는 창은 확인 버튼에 초점 (데스크톱 focusConfirmOnMount)
    useEffect(() => {
        if (!open || !variant.focusConfirmOnMount) return
        confirmRef.current?.focus({ preventScroll: true })
    }, [open, focusKey, variant.focusConfirmOnMount])

    // 덮개·감싸개 class는 데스크톱 variant 그대로 (body로 꺼내서 fixed가 화면 기준), 안쪽만 안전영역 비킴
    return (
        <AnimatePresence>
            {open ? (
                <div key="dialog" {...wrapperProps}>
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
                    <div className={variant.wrapClass}>
                        <div className="flex h-full w-full items-center justify-center safe-pt safe-pb safe-px">
                            <motion.div
                                role="dialog"
                                aria-modal="true"
                                aria-label={variant.dialogLabel}
                                className={variant.panelClass}
                                style={{ transformOrigin: preset.transformOrigin }}
                                initial={preset.getPanelInitial(reduced)}
                                animate={preset.getPanelAnimate(reduced)}
                                exit={preset.getPanelExit(reduced)}
                                transition={transition}
                            >
                                <ParchmentFrame>
                                    {children}
                                    {showConfirm && onDismiss ? (
                                        <ConfirmButton
                                            ref={confirmRef}
                                            label={confirmLabel}
                                            onClick={onDismiss}
                                            raised={raised}
                                        />
                                    ) : null}
                                </ParchmentFrame>
                            </motion.div>
                        </div>
                    </div>
                </div>
            ) : null}
        </AnimatePresence>
    )
}
