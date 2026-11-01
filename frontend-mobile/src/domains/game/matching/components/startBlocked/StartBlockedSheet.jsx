// 게임 시작 막힘 안내 창: 덮개 + 양피지 창에 제목·사유·확인 버튼
// GameMatchingPage가 씀, 덮개·이름·글·초점은 데스크톱 GameStartBlockedModal(gameStartBlocked 양피지 창) 그대로
import { useEffect, useRef } from "react"
import { BLOCKED_MSG_CLASS, BLOCKED_TITLE, BLOCKED_TITLE_CLASS } from "@/domains/game/matching/constants/gameStartMessages.js"
import {
  BTN_ASSET,
  IMG_CLASS,
  PARCHMENT_CONFIRM_LABEL,
} from "@/domains/game/ingame/constants/parchment/ingameParchmentConfirmButton.js"
import { getInGameParchmentModalVariant } from "@/domains/game/ingame/constants/parchment/ingameParchmentModalVariants.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import SheetPortal from "@m/shared/ui/sheet/SheetPortal.jsx"
import ParchmentFrame from "./ParchmentFrame.jsx"

const VARIANT = getInGameParchmentModalVariant("gameStartBlocked")

// 확인 버튼 (데스크톱 CONFIRM_BTN_CLASS_RAISED_FOCUS 최대 크기, 높이 44px 넘음)
const CONFIRM_CLASS =
  "relative mt-2 block w-[9.3rem] shrink-0 cursor-pointer border-0 bg-transparent p-0 leading-none transition-transform active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6b4321]"
const CONFIRM_LABEL_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center pb-[2%] pt-[0.12rem] font-subheading text-[0.92rem] font-bold text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]"

// 데스크톱 variant의 absolute 덮개·감싸개를 body 기준 fixed로 (페이지 밖에 띄움)
const toFixed = (className) => className.replace(/^absolute /, "fixed ")

// 시작 막힘 안내 (덮개·Esc·확인 모두 onClose로 문구 지움), 사유 없으면 안 그림
export default function StartBlockedSheet({ message, onClose }) {
  const open = Boolean(message)
  const confirmRef = useRef(null)

  // 뜰 때·사유 바뀔 때 확인 버튼에 초점 (데스크톱 focusConfirmOnMount)
  useEffect(() => {
    if (open) confirmRef.current?.focus({ preventScroll: true })
  }, [open, message])

  return (
    <SheetPortal open={open} onClose={onClose}>
      <div key="start-blocked" data-game-start-blocked="">
        <button
          type="button"
          aria-label={VARIANT.backdropLabel}
          className={toFixed(VARIANT.backdropClass)}
          data-sfx-kind="ui-cancel"
          onClick={onClose}
        />
        <div className={toFixed(VARIANT.wrapClass)}>
          <div role="dialog" aria-modal="true" aria-label={VARIANT.dialogLabel} className={VARIANT.panelClass}>
            <ParchmentFrame>
              <h2 className={BLOCKED_TITLE_CLASS}>{BLOCKED_TITLE}</h2>
              <p role="alert" className={BLOCKED_MSG_CLASS}>{message}</p>
              <button
                ref={confirmRef}
                type="button"
                aria-label={PARCHMENT_CONFIRM_LABEL}
                className={CONFIRM_CLASS}
                data-sfx-kind="ui-confirm"
                onClick={onClose}
              >
                <PublicAsset src={BTN_ASSET} alt="" draggable={false} className={IMG_CLASS} />
                <span className={CONFIRM_LABEL_CLASS}>{PARCHMENT_CONFIRM_LABEL}</span>
              </button>
            </ParchmentFrame>
          </div>
        </div>
      </div>
    </SheetPortal>
  )
}
