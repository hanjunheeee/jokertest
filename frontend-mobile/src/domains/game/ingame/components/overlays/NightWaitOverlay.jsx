// 밤 연출 대기 창: 다른 사람 밤 성공 연출이 끝날 때까지 확인 버튼 없이 덮음
// OverlayLayer가 씀, 열림은 스토어 대기 알림(useOverlayLayer의 waitOpen), 덮개·z순서는 데스크톱과 같음
import { PRIVATE_RESULT_MSG_CLASS } from "@/domains/game/ingame/constants/ingameNightPrivateResult.js"
import ParchmentFrame from "@m/shared/ui/modal/parchment/ParchmentFrame.jsx"
import { NIGHT_WAIT_MSG } from "./overlayText.js"

// 대기 해제 알림이 오거나 밤이 끝나면 닫힘 (누르기로 못 닫음)
export default function NightWaitOverlay({ open }) {
    if (!open) return null

    return (
        <div className="fixed inset-0 z-[65] bg-black/70" data-ingame-night-presentation-wait="true">
            <div className="fixed inset-0 z-[66] flex items-center justify-center overflow-hidden px-[clamp(0.5rem,3vw,2rem)] py-[clamp(0.5rem,3vh,2rem)] safe-pt safe-pb">
                <ParchmentFrame>
                    <p className={PRIVATE_RESULT_MSG_CLASS}>{NIGHT_WAIT_MSG}</p>
                </ParchmentFrame>
            </div>
        </div>
    )
}
