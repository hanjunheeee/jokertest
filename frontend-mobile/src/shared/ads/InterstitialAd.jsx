// 한 판 끝 광고 창: 어두운 덮개 + 양피지 틀 안 광고 + "5초 뒤 닫기" → 닫기 버튼
// pages/GameResultPage가 씀, 5초 전엔 뒤 화면·Esc·뒤로 가기 다 막힘, 광고 없음·실패면 바로 닫힘
import { useEffect, useRef, useState } from "react"
import { motion } from "framer-motion"
import { getInGameParchmentModalVariant } from "@/domains/game/ingame/constants/parchment/ingameParchmentModalVariants.js"
import ConfirmButton from "@m/shared/ui/modal/parchment/ConfirmButton.jsx"
import ParchmentFrame from "@m/shared/ui/modal/parchment/ParchmentFrame.jsx"
import SheetPortal from "@m/shared/ui/sheet/SheetPortal.jsx"
import AdSlot from "@m/shared/ads/AdSlot.jsx"
import {
  INTERSTITIAL_AD_BOX_CLASS,
  INTERSTITIAL_TITLE_CLASS,
  INTERSTITIAL_WAIT_CLASS,
} from "@m/shared/ads/interstitialAdStyle.js"
import { INTERSTITIAL_WAIT_SEC, secondsLeft } from "@m/shared/ads/interstitialRule.js"
import { useBackClose } from "@m/shared/ads/useBackClose.js"

const VARIANT = getInGameParchmentModalVariant("interstitialAd")

// 닫기까지 남은 초 (열린 때부터 0.25초마다 다시 셈)
function useWaitSeconds() {
  const [startedAt] = useState(() => Date.now())
  const [left, setLeft] = useState(INTERSTITIAL_WAIT_SEC)

  useEffect(() => {
    if (left === 0) return undefined
    const timer = window.setInterval(() => setLeft(secondsLeft(startedAt, Date.now())), 250)
    return () => window.clearInterval(timer)
  }, [startedAt, left])

  return left
}

// 열린 창 안쪽 (열릴 때마다 새로 그려져서 초가 처음부터)
function Panel({ mode, onClose }) {
  const left = useWaitSeconds()
  const canClose = left === 0
  const closeRef = useRef(null)

  useBackClose(true, canClose, onClose)

  // 닫기 버튼 나오면 초점 (키보드 Enter로도 닫힘)
  useEffect(() => {
    if (canClose) closeRef.current?.focus({ preventScroll: true })
  }, [canClose])

  // Esc: 5초 지난 뒤만
  useEffect(() => {
    if (!canClose) return undefined
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [canClose, onClose])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className={VARIANT.backdropClass} aria-hidden="true" />
      <div className={VARIANT.wrapClass}>
        <div
          role="dialog"
          aria-modal="true"
          aria-label={VARIANT.dialogLabel}
          className={VARIANT.panelClass}
          data-interstitial-ad=""
        >
          <ParchmentFrame scrollContent={false} contentClassName="gap-2 land:gap-1.5">
            <h2 className={INTERSTITIAL_TITLE_CLASS}>광고</h2>
            <div className={INTERSTITIAL_AD_BOX_CLASS}>
              <AdSlot name="interstitial" mode={mode} onEmpty={onClose} />
            </div>
            <div className="flex w-full justify-center" aria-live="polite">
              {canClose ? (
                <ConfirmButton ref={closeRef} label="닫기" onClick={onClose} raised sfxKind="ui-cancel" />
              ) : (
                <p className={INTERSTITIAL_WAIT_CLASS}>{left}초 뒤 닫기</p>
              )}
            </div>
          </ParchmentFrame>
        </div>
      </div>
    </motion.div>
  )
}

// open·mode·close는 useInterstitialAd가 줌
export default function InterstitialAd({ open, mode, onClose }) {
  return (
    <SheetPortal open={open && mode !== "off"}>
      <Panel key="interstitial-ad" mode={mode} onClose={onClose} />
    </SheetPortal>
  )
}