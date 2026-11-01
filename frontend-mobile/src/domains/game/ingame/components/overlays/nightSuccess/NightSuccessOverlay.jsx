// 밤 성공 연출 창: 대기열 맨 앞 사건을 영상(또는 자료 대기 창)으로, 다 보면 최종 생존 결과
// OverlayLayer가 씀, 값은 useInGameNightSuccessPresentation (데스크톱 InGameNightSuccessPresentation과 같은 순서)
import { resolveNightSuccessVideo } from "@/domains/game/ingame/utils/resolveNightSuccessVideo.js"
import {
    buildFinalStatusLabel,
    buildPendingAssetLabel,
} from "@/domains/game/ingame/constants/ingameNightSuccess.js"
import ParchmentDialog from "../parchment/ParchmentDialog.jsx"
import ConfirmButton from "../parchment/ConfirmButton.jsx"
import { BIG_MSG_CLASS } from "../overlayText.js"
import KillVideo from "./KillVideo.jsx"

// 사건 영상 → 자료 대기 → 최종 결과 순으로 하나만 그림
export default function NightSuccessOverlay({ current, open, finish, finalStatus, onClose }) {
    if (!open) return null

    if (current) {
        const video = resolveNightSuccessVideo(current)
        if (video) return <KillVideo eventId={current.eventId} src={video.src} finish={finish} />

        // 영상 자료 없는 종류: 대기 문구 (문구 없는 종류면 안 그림)
        const label = buildPendingAssetLabel(current.type)
        if (label === null) return null
        // 덮개 누름은 건너뜀, 확인은 다 본 것
        return (
            <ParchmentDialog
                open
                variantKey="nightPrivateResult"
                zClass="z-[65]"
                onDismiss={() => finish("SKIPPED")}
                showConfirm={false}
                focusKey={current.eventId}
                wrapperProps={{ "data-ingame-night-success-pending": "" }}
            >
                <p className={BIG_MSG_CLASS}>{label}</p>
                <ConfirmButton label="확인" onClick={() => finish("COMPLETED")} />
            </ParchmentDialog>
        )
    }

    if (!finalStatus) return null

    return (
        <ParchmentDialog
            open
            variantKey="nightPrivateResult"
            zClass="z-[65]"
            onDismiss={onClose}
            confirmLabel="확인"
            wrapperProps={{ "data-ingame-night-success-final": finalStatus.alive ? "ALIVE" : "DEAD" }}
        >
            <p className={BIG_MSG_CLASS}>{buildFinalStatusLabel(finalStatus.alive)}</p>
        </ParchmentDialog>
    )
}
