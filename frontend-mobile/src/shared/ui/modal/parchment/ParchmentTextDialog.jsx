// 양피지 가운데 창 (어두운 덮개 + ParchmentFrame + 제목) — 약관 보기·긴 글 팝업
// TermsView 등이 씀
import { useId } from "react"
import { getInGameParchmentModalVariant } from "@/domains/game/ingame/constants/parchment/ingameParchmentModalVariants.js"
import ParchmentFrame from "@m/shared/ui/modal/parchment/ParchmentFrame.jsx"
import SheetPortal from "@m/shared/ui/sheet/SheetPortal.jsx"

const VARIANT = getInGameParchmentModalVariant("gameStartBlocked")
const toFixed = (className) => className.replace(/^absolute /, "fixed ")

export const PARCHMENT_DIALOG_TITLE_CLASS =
    "w-full text-center font-subheading font-bold text-[#3a1a0c] app-text-scaled [--app-text-size:0.95rem] land:[--app-text-size:0.9rem]"

export default function ParchmentTextDialog({
    open,
    title,
    onClose,
    closable = true,
    ariaLabel,
    children,
    frameClassName = "",
}) {
    const titleId = useId()
    const close = closable ? onClose : null
    const label = ariaLabel ?? title

    return (
        <SheetPortal open={open} onClose={close}>
            <div data-parchment-text-dialog="">
                {closable ? (
                    <button
                        type="button"
                        aria-label={VARIANT.backdropLabel}
                        className={toFixed(VARIANT.backdropClass)}
                        data-sfx-kind="ui-cancel"
                        onClick={onClose}
                    />
                ) : (
                    <div className={toFixed(VARIANT.backdropClass)} aria-hidden="true" />
                )}
                <div className={toFixed(VARIANT.wrapClass)}>
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby={title ? titleId : undefined}
                        aria-label={title ? undefined : label}
                        className={VARIANT.panelClass}
                    >
                        <ParchmentFrame className={frameClassName}>
                            {title ? (
                                <h2 id={titleId} className={PARCHMENT_DIALOG_TITLE_CLASS}>
                                    {title}
                                </h2>
                            ) : null}
                            {children}
                        </ParchmentFrame>
                    </div>
                </div>
            </div>
        </SheetPortal>
    )
}
