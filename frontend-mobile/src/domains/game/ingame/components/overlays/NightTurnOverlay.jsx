// 밤 차례 안내 창: "광대의 시간입니다" 한 줄, 정한 시간 지나면 훅이 저절로 닫음
// OverlayLayer가 씀, 값은 useInGameNightTurnAnnouncement(useInGameOverlayStack 안)
import { CLOSE_LABEL } from "@/domains/game/ingame/constants/nightTurn/ingameNightTurnAnnouncement.js"
import ParchmentDialog from "./parchment/ParchmentDialog.jsx"
import { BIG_MSG_CLASS, META_CLASS } from "./overlayText.js"

// 안내 내용 없으면 안 그림
export default function NightTurnOverlay({ open, announcement, onClose }) {
    if (!announcement) return null

    return (
        <ParchmentDialog
            open={open}
            variantKey="nightTurn"
            zClass="z-[60]"
            onDismiss={onClose}
            confirmLabel={CLOSE_LABEL}
            wrapperProps={{ "data-night-turn-role": announcement.role }}
        >
            <p className={BIG_MSG_CLASS}>{announcement.message}</p>
            <p className={META_CLASS}>밤이 깊어갑니다</p>
        </ParchmentDialog>
    )
}
