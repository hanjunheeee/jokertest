// 밤 성공 연출: 대기열 맨 앞 사건을 영상·자료 대기 창으로, 다 보면 최종 생존 결과 창
// 인게임 화면이 사용 (open을 넘기면 그 값을, 안 넘기면 useInGameNightSuccessPresentation을 직접 씀)
import { useCallback } from "react"
import InGameParchmentModalBase from "./parchment/InGameParchmentModalBase.js"
import InGameNightSuccessKillVideo from "./nightSuccess/InGameNightSuccessKillVideo.jsx"
import InGameNightSuccessPendingAsset from "./nightSuccess/InGameNightSuccessPendingAsset.jsx"
import { useInGameNightSuccessPresentation } from "../hooks/useInGameNightSuccessPresentation.js"
import { resolveNightSuccessVideo } from "../utils/resolveNightSuccessVideo.js"
import { buildFinalStatusLabel } from "../constants/ingameNightSuccess.js"
import { PRIVATE_RESULT_MSG_CLASS } from "../constants/ingameNightPrivateResult.js"

// 밤 성공 연출 창 고르기: 사건 영상·자료 대기 → 최종 결과 순
export default function InGameNightSuccessPresentation({
  current: currentProp,
  open: openProp,
  finish: finishProp,
  assetStatus: assetStatusProp,
  finalStatus: finalStatusProp,
  onClose: onCloseProp,
  hold = false,
} = {}) {
  // open을 받으면 바깥 값을 씀, 그때 안쪽 훅은 hold로 안 열리게만 둠
  const controlled = openProp !== undefined
  const owned = useInGameNightSuccessPresentation({ hold: controlled || hold })

  const current = controlled ? currentProp : owned.current
  const open = controlled ? openProp : owned.open
  // 끝맺음 알림은 바깥 조종이면 바깥 finish, 아니면 훅 finish로
  const finish = useCallback((outcome) => {
    if (controlled) {
      finishProp(outcome)
      return
    }
    owned.finish(outcome)
  }, [controlled, finishProp, owned.finish])
  const finalStatus = controlled ? finalStatusProp : owned.finalStatus
  const onClose = controlled ? onCloseProp : owned.onClose
  // assetStatus는 받기만 하고 안 씀 (영상 유무는 아래에서 다시 봄)
  void assetStatusProp

  if (!open) return null

  // 사건이 있으면 영상 자료가 있는지에 따라 영상 또는 대기 창
  if (current) {
    const video = resolveNightSuccessVideo(current)
    if (video) {
      return <InGameNightSuccessKillVideo eventId={current.eventId} src={video.src} finish={finish} />
    }
    return (
      <InGameNightSuccessPendingAsset type={current.type} eventId={current.eventId} onFinish={finish} />
    )
  }

  // 사건을 다 봤으면 최종 생존 결과
  if (finalStatus) {
    return (
      <InGameParchmentModalBase
        variantKey="nightPrivateResult"
        onDismiss={onClose}
        confirmLabel="확인"
        wrapperProps={{
          "data-ingame-night-success-final": finalStatus.alive ? "ALIVE" : "DEAD",
        }}
      >
        <p className={PRIVATE_RESULT_MSG_CLASS}>
          {buildFinalStatusLabel(finalStatus.alive)}
        </p>
      </InGameParchmentModalBase>
    )
  }

  return null
}
