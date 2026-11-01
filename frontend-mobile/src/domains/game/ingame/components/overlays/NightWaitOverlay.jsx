// 밤 연출 대기 창: 다른 사람 밤 성공 연출이 끝날 때까지 확인 버튼 없이 덮음
// OverlayLayer가 씀, 열림은 스토어 대기 알림(useOverlayLayer의 waitOpen)
import ParchmentFrame from "./parchment/ParchmentFrame.jsx"
import { BIG_MSG_CLASS, NIGHT_WAIT_MSG } from "./overlayText.js"

// 대기 해제 알림이 오거나 밤이 끝나면 닫힘 (누르기로 못 닫음)
export default function NightWaitOverlay({ open }) {
    if (!open) return null

    return (
        <div className="fixed inset-0 z-[65] bg-black/70" data-ingame-night-presentation-wait="true">
            <div className="absolute inset-0 flex items-center justify-center overflow-hidden safe-pt safe-pb">
                <ParchmentFrame role="status" aria-live="polite">
                    <p className={BIG_MSG_CLASS}>{NIGHT_WAIT_MSG}</p>
                    <span className="mt-1 flex gap-1.5" aria-hidden="true">
                        <i className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#5b3a20]" />
                        <i className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#5b3a20] [animation-delay:200ms]" />
                        <i className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#5b3a20] [animation-delay:400ms]" />
                    </span>
                </ParchmentFrame>
            </div>
        </div>
    )
}
