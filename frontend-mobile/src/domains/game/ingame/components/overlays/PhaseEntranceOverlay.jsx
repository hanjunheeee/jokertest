// 낮·밤 시작 안내 창: "낮이 되었습니다" 같은 한 줄과 확인 버튼
// OverlayLayer가 씀, 열림·확인은 useInGamePhaseEntrance(useInGameOverlayStack 안), 글·모양은 데스크톱 상수
import {
    CONFIRM_LABEL,
    MSG_CLASS,
    getEntranceMsg,
} from "@/domains/game/ingame/constants/ingamePhaseEntrance.js"
import ParchmentDialog from "./parchment/ParchmentDialog.jsx"

// 낮·밤 아닌 단계면 문구가 없어서 안 띄움
export default function PhaseEntranceOverlay({ open, phase, onConfirm }) {
    const message = getEntranceMsg(phase)
    const active = Boolean(open) && message !== null

    return (
        <ParchmentDialog
            open={active}
            variantKey="phaseEntrance"
            onDismiss={onConfirm}
            confirmLabel={CONFIRM_LABEL}
            focusKey={phase}
            wrapperProps={{ "data-ingame-phase-entrance": phase ?? "" }}
        >
            <p className={MSG_CLASS}>{message}</p>
        </ParchmentDialog>
    )
}
