// 낮 시작 연출: 지난밤 살해당한 사람이 있으면 암살 영상 + 글, 의사가 살렸으면 글 창
// 인게임 화면(InGamePage)이 낮이 될 때 모두에게 띄움, 다 보면 onFinish → "낮이 되었습니다"·결과 화면이 이어짐
import { useState } from "react"
import InGameParchmentModalBase from "../parchment/InGameParchmentModalBase.js"
import InGameNightSuccessKillVideo from "../nightSuccess/InGameNightSuccessKillVideo.jsx"
import { resolveNightSuccessVideo } from "../../utils/resolveNightSuccessVideo.js"
import { buildDawnReportMessage, DAWN_REPORT_KIND } from "../../utils/dawnReport.js"
import { PRIVATE_RESULT_MSG_CLASS } from "../../constants/ingameNightPrivateResult.js"

// 모두에게 같은 영상: 당한 사람 시점 사망 영상 (광대 시점 영상은 광대 쪽 화면이라 안 씀)
const DAWN_KILL_VIDEO_ENTRY = Object.freeze({ type: "KILL", perspectives: Object.freeze(["TARGET"]) })

// report가 바뀌면 부르는 쪽이 key로 새로 그림 (영상 실패 표시가 다음 연출에 안 남게)
export default function InGameDawnReport({ report, open, onFinish }) {
  // 영상이 오류로 끝나면 글 창으로 바꿔 글은 꼭 보이게
  const [videoFailed, setVideoFailed] = useState(false)

  if (!open || !report) return null
  const message = buildDawnReportMessage(report)
  if (!message) return null

  const video = report.kind === DAWN_REPORT_KIND.KILLED ? resolveNightSuccessVideo(DAWN_KILL_VIDEO_ENTRY) : null
  if (video && !videoFailed) {
    const finishVideo = (outcome) => {
      if (outcome === "ERROR") {
        setVideoFailed(true)
        return
      }
      onFinish()
    }
    return (
      <InGameNightSuccessKillVideo eventId={report.key} src={video.src} finish={finishVideo} message={message} />
    )
  }

  // 글 창 (확인·바깥 누름·Esc 모두 닫기)
  return (
    <InGameParchmentModalBase
      variantKey="phaseEntrance"
      onDismiss={onFinish}
      confirmLabel="확인"
      focusKey={report.key}
      wrapperProps={{ "data-ingame-dawn-report": report.kind }}
    >
      <p className={PRIVATE_RESULT_MSG_CLASS}>{message}</p>
    </InGameParchmentModalBase>
  )
}
