// 낮·밤 시작 안내 창: "낮이 되었습니다" 같은 한 줄과 확인 버튼
// OverlayLayer가 씀, 열림·확인은 useInGamePhaseEntrance(useInGameOverlayStack 안)
import {
    CONFIRM_LABEL,
    getEntranceMsg,
} from "@/domains/game/ingame/constants/ingamePhaseEntrance.js"
import ParchmentDialog from "./parchment/ParchmentDialog.jsx"
import { BIG_MSG_CLASS } from "./overlayText.js"

// 낮·밤 아닌 단계면 문구가 없어서 안 띄움
export default function PhaseEntranceOverlay({ open, phase, onConfirm }) {
    const message = getEntranceMsg(phase)
    const active = Boolean(open) && message !== null

    return (
        <ParchmentDialog
            open={active}
            variantKey="phaseEntrance"
            zClass="z-[60]"
            onDismiss={onConfirm}
            confirmLabel={CONFIRM_LABEL}
            focusKey={phase}
            wrapperProps={{ "data-ingame-phase-entrance": phase ?? "" }}
        >
            <p className={BIG_MSG_CLASS}>{message}</p>
        </ParchmentDialog>
    )
}
