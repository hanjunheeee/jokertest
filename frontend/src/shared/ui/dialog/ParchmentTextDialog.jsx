// 양피지 가운데 창 (어두운 덮개 + 양피지 판 + 제목 + 초점 가두기)
// 약관 보기·약관 재동의·쿠폰 입력 등 긴 글 대화상자가 사용 (데스크톱)
import { useId, useRef } from "react"
import { createPortal } from "react-dom"
import { getInGameParchmentModalVariant } from "@/domains/game/ingame/constants/parchment/ingameParchmentModalVariants.js"
import InGameParchmentPanelBase from "@/domains/game/ingame/components/parchment/InGameParchmentPanelBase.js"
import { useInGameModalLayer } from "@/domains/game/ingame/hooks/useInGameModalLayer.js"
import {
  FALLBACK_FRAME_CLASS,
  FRAME_CLASS,
} from "@/domains/game/ingame/constants/parchment/ingameParchmentLayout.js"
import {
  TERMS_PARCHMENT_CONTENT_CLASS,
  TERMS_PARCHMENT_FALLBACK_CONTENT_CLASS,
} from "@/domains/auth/components/terms/termsStyle.js"

const VARIANT = getInGameParchmentModalVariant("gameStartBlocked")

// 로그인·가입 화면용: 매칭 안내 variant는 absolute라 전역 fixed·z로 맞춤
const toAuthLayerClass = (className) =>
  className
    .replace(/\babsolute\b/g, "fixed")
    .replace(/\bz-40\b/, "z-[90]")
    .replace(/\bz-\[41\]/, "z-[91]")

export const PARCHMENT_DIALOG_TITLE_CLASS =
  "mb-[clamp(0.1rem,0.3vw,0.2rem)] w-full shrink-0 text-center font-subheading app-text-scaled [--app-text-size:clamp(0.9rem,1.4vw,1.05rem)] font-bold text-[#3a1a0c]"

// 열릴 때 창 안으로 초점을 옮기고 Tab 순환을 가두며 닫힐 때 원래 초점을 되돌림
export default function ParchmentTextDialog({
  open,
  title,
  onClose,
  closable = true,
  ariaLabel,
  children,
  parchmentContentClass = "",
  titleClassName = "",
  frameClassName = FRAME_CLASS,
  fallbackFrameClassName = FALLBACK_FRAME_CLASS,
  contentBaseClassName = TERMS_PARCHMENT_CONTENT_CLASS,
  fallbackContentBaseClassName = TERMS_PARCHMENT_FALLBACK_CONTENT_CLASS,
}) {
  const titleId = useId()
  const dialogRef = useRef(null)
  const close = closable ? onClose : null
  const label = ariaLabel ?? title

  useInGameModalLayer({
    open: Boolean(open),
    onClose: close,
    containerRef: dialogRef,
    moveFocus: true,
    trapFocus: true,
  })

  if (!open || typeof document === "undefined") return null

  return createPortal(
    <div data-parchment-text-dialog="">
      {closable ? (
        <button
          type="button"
          aria-label={VARIANT.backdropLabel}
          className={toAuthLayerClass(VARIANT.backdropClass)}
          data-sfx-kind="ui-cancel"
          onClick={onClose}
        />
      ) : (
        <div className={toAuthLayerClass(VARIANT.backdropClass)} aria-hidden="true" />
      )}
      <div className={toAuthLayerClass(VARIANT.wrapClass)}>
        <div
          ref={dialogRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-labelledby={title ? titleId : undefined}
          aria-label={title ? undefined : label}
          className={VARIANT.panelClass}
        >
          <InGameParchmentPanelBase
            frameClassName={frameClassName}
            fallbackFrameClassName={fallbackFrameClassName}
            contentBaseClassName={contentBaseClassName}
            fallbackContentBaseClassName={fallbackContentBaseClassName}
            contentClassName={parchmentContentClass}
          >
            {title ? (
              <h2 id={titleId} className={`${PARCHMENT_DIALOG_TITLE_CLASS} ${titleClassName}`.trim()}>
                {title}
              </h2>
            ) : null}
            {children}
          </InGameParchmentPanelBase>
        </div>
      </div>
    </div>,
    document.body,
  )
}
