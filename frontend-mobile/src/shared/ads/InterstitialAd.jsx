// 한 판 끝 광고 창: 화면 전체를 덮는 어두운 막 + 양피지색 틀 안 광고 + "5초 뒤 닫기" → 닫기 버튼
// pages/GameResultPage가 씀, 5초 전엔 뒤 화면·Esc·뒤로 가기 다 막힘, 광고 없음·실패면 바로 닫힘
import { useEffect, useRef, useState } from "react"
import { motion } from "framer-motion"
import ConfirmButton from "@m/shared/ui/modal/parchment/ConfirmButton.jsx"
import SheetPortal from "@m/shared/ui/sheet/SheetPortal.jsx"
import AdSlot from "@m/shared/ads/AdSlot.jsx"
import { INTERSTITIAL_WAIT_SEC, secondsLeft } from "@m/shared/ads/interstitialRule.js"
import { useBackClose } from "@m/shared/ads/useBackClose.js"

// 막은 뒤 화면을 눌러도 아무 일 없음 (닫기 아님)
const BACKDROP_CLASS = "fixed inset-0 z-[120] bg-black/82"

const WRAP_CLASS =
    "fixed inset-0 z-[121] flex items-center justify-center px-4 safe-pt safe-pb safe-px"

// 상점·시트와 같은 양피지색 판 + 갈색 테두리
const PANEL_CLASS =
    "flex w-[min(100%,21rem)] flex-col items-center gap-3 rounded-[0.9rem] border-2 border-[#6b4321] bg-[#f5f0e6] px-3 pt-3 pb-4 shadow-[0_12px_40px_rgba(0,0,0,0.7)] md:w-[24rem]"

const TITLE_CLASS = "font-subheading text-sm font-bold tracking-wide text-[#3a1a0c]/80"

const WAIT_CLASS = "flex h-[3.1rem] items-center font-subheading text-base font-semibold text-[#3a1a0c]"

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
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
            <div className={BACKDROP_CLASS} aria-hidden="true" />
            <div className={WRAP_CLASS}>
                <div role="dialog" aria-modal="true" aria-label="광고" className={PANEL_CLASS} data-interstitial-ad="">
                    <p className={TITLE_CLASS}>광고</p>
                    <AdSlot name="interstitial" mode={mode} onEmpty={onClose} />
                    {/* 광고와 닫기 사이를 띄워 잘못 눌림 줄이기 */}
                    <div className="mt-2" aria-live="polite">
                        {canClose ? (
                            <ConfirmButton ref={closeRef} label="닫기" onClick={onClose} raised sfxKind="ui-cancel" />
                        ) : (
                            <p className={WAIT_CLASS}>{left}초 뒤 닫기</p>
                        )}
                    </div>
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
