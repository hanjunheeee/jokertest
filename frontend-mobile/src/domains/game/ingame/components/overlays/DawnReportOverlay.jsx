// 낮 시작 연출 창: 지난밤 살해당한 사람이 있으면 암살 영상 + 글, 아무도 안 죽었으면 "아무 일도 일어나지 않았습니다" 글 창
// OverlayLayer가 씀, 값은 useOverlayLayer의 dawnReport (데스크톱 InGameDawnReport와 같은 순서·글)
import { useState } from "react"
import { resolveNightSuccessVideo } from "@/domains/game/ingame/utils/resolveNightSuccessVideo.js"
import { buildDawnReportMessage, DAWN_REPORT_KIND } from "@/domains/game/ingame/utils/dawnReport.js"
import { PRIVATE_RESULT_MSG_CLASS } from "@/domains/game/ingame/constants/ingameNightPrivateResult.js"
import ParchmentDialog from "./parchment/ParchmentDialog.jsx"
import KillVideo from "./nightSuccess/KillVideo.jsx"

// 모두에게 같은 영상: 당한 사람 시점 사망 영상 (데스크톱과 같음)
const DAWN_KILL_VIDEO_ENTRY = Object.freeze({ type: "KILL", perspectives: Object.freeze(["TARGET"]) })

// report가 바뀌면 부르는 쪽이 key로 새로 그림 (영상 실패 표시가 다음 연출에 안 남게)
export default function DawnReportOverlay({ report, open, onFinish }) {
    // 영상이 오류로 끝나면 글 창으로 바꿔 글은 꼭 보이게
    const [videoFailed, setVideoFailed] = useState(false)

    const message = report ? buildDawnReportMessage(report) : null
    const active = Boolean(open) && typeof message === "string" && message.length > 0
    const video = active && report.kind === DAWN_REPORT_KIND.KILLED
        ? resolveNightSuccessVideo(DAWN_KILL_VIDEO_ENTRY)
        : null

    if (video && !videoFailed) {
        const finishVideo = (outcome) => {
            if (outcome === "ERROR") {
                setVideoFailed(true)
                return
            }
            onFinish()
        }
        return <KillVideo eventId={report.key} src={video.src} finish={finishVideo} message={message} />
    }

    // 글 창 (확인·덮개 누름·Esc 모두 닫기), 닫힘 움직임 때문에 열림 값으로 넘김
    return (
        <ParchmentDialog
            open={active}
            variantKey="phaseEntrance"
            onDismiss={onFinish}
            confirmLabel="확인"
            focusKey={report?.key ?? null}
            wrapperProps={{ "data-ingame-dawn-report": report?.kind ?? "" }}
        >
            <p className={PRIVATE_RESULT_MSG_CLASS}>{message}</p>
        </ParchmentDialog>
    )
}
