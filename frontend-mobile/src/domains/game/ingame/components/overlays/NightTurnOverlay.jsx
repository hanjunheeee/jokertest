// 밤 차례 안내 창: "광대의 시간입니다" 한 줄, 정한 시간 지나면 훅이 저절로 닫음
// OverlayLayer가 씀, 값은 useInGameNightTurnAnnouncement(useInGameOverlayStack 안), 글·모양은 데스크톱 상수
import { CLOSE_LABEL } from "@/domains/game/ingame/constants/nightTurn/ingameNightTurnAnnouncement.js"
import {
    META_CLASS,
    MSG_CLASS,
} from "@/domains/game/ingame/constants/nightTurn/ingameNightTurnAnnouncementLayout.js"
import ParchmentDialog from "./parchment/ParchmentDialog.jsx"

// 안내 내용 없으면 안 그림
export default function NightTurnOverlay({ open, announcement, onClose }) {
    if (!announcement) return null

    return (
        <ParchmentDialog
            open={open}
            variantKey="nightTurn"
            onDismiss={onClose}
            confirmLabel={CLOSE_LABEL}
            wrapperProps={{ "data-night-turn-role": announcement.role }}
        >
            <p className={MSG_CLASS}>{announcement.message}</p>
            <p className={META_CLASS}>밤이 깊어갑니다</p>
        </ParchmentDialog>
    )
}
