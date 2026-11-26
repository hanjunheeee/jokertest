// 낮·밤 시작 안내 창: "낮이 되었습니다"·"밤이 되었습니다" 한 줄과 재판 없이 밤일 때 까닭 한 줄, 확인 버튼
// OverlayLayer가 씀, 열림·확인은 useInGamePhaseEntrance(useInGameOverlayStack 안), 글·모양은 데스크톱 상수
import {
    CONFIRM_LABEL,
    MSG_CLASS,
    REASON_CLASS,
    getEntranceMsg,
    getNightReasonMsg,
} from "@/domains/game/ingame/constants/ingamePhaseEntrance.js"
import { useInGameStore } from "@/domains/game/ingame/store/ingameStore.js"
import ParchmentDialog from "./parchment/ParchmentDialog.jsx"

// 지금 밤이면 그날 낮 투표 판정 결과 반환 (새 낮이 되면 판정 값이 비워짐)
const selectNightOutcome = (s) => (s.state?.phase === "NIGHT" ? (s.state.dayVoteResolution?.outcome ?? null) : null)

// 낮·밤 아닌 단계면 문구가 없어서 안 띄움
export default function PhaseEntranceOverlay({ open, phase, onConfirm }) {
    const message = getEntranceMsg(phase)
    const reason = getNightReasonMsg(phase, useInGameStore(selectNightOutcome))
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
            {reason !== null ? (
                <p className={REASON_CLASS} data-ingame-phase-entrance-reason="">
                    {reason}
                </p>
            ) : null}
        </ParchmentDialog>
    )
}
