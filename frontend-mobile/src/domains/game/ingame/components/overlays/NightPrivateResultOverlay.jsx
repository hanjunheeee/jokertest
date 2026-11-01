// 밤 개인 결과 창: 조사·확인 결과나 암살 실패 문구, 확인하면 스토어 결과 지움
// OverlayLayer가 씀, 문구는 useInGameNightPrivateResult가 만듦, 글·모양은 데스크톱 상수
import {
    CONFIRM_LABEL,
    PRIVATE_RESULT_MSG_CLASS,
} from "@/domains/game/ingame/constants/ingameNightPrivateResult.js"
import ParchmentDialog from "./parchment/ParchmentDialog.jsx"

// 열림이어도 문구가 비었으면 안 띄움, 문구 바뀌면 확인 버튼에 다시 초점
export default function NightPrivateResultOverlay({ open, kind, label, onConfirm }) {
    const active = Boolean(open) && typeof label === "string" && label.length > 0

    return (
        <ParchmentDialog
            open={active}
            variantKey="nightPrivateResult"
            onDismiss={onConfirm}
            confirmLabel={CONFIRM_LABEL}
            focusKey={label}
            wrapperProps={{ "data-ingame-night-private-result": kind ?? "" }}
        >
            <p className={PRIVATE_RESULT_MSG_CLASS}>{label}</p>
        </ParchmentDialog>
    )
}
