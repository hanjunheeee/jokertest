// 밤 성공 연출: 대기열 맨 앞 사건을 영상·자료 대기 창으로, 다 보면 최종 생존 결과 창
// 인게임 화면이 띄움 (props로 받으면 그 값을, 없으면 useInGameNightSuccessPresentation을 직접 씀)
import { useCallback } from "react"
import InGameParchmentModalBase from "./parchment/InGameParchmentModalBase.js"
import InGameNightSuccessKillVideo from "./nightSuccess/InGameNightSuccessKillVideo.jsx"
import InGameNightSuccessPendingAsset from "./nightSuccess/InGameNightSuccessPendingAsset.jsx"
import { useInGameNightSuccessPresentation } from "../hooks/useInGameNightSuccessPresentation.js"
import { resolveNightSuccessVideo } from "../utils/resolveNightSuccessVideo.js"
import { buildFinalStatusLabel } from "../constants/ingameNightSuccess.js"
import { PRIVATE_RESULT_MSG_CLASS } from "../constants/nightPrivateResult/ingameNightPrivateResult.js"

export default function InGameNightSuccessPresentation({
  current: currentProp,
  open: openProp,
  finish: finishProp,
  assetStatus: assetStatusProp,
  finalStatus: finalStatusProp,
  onClose: onCloseProp,
  hold = false,
} = {}) {
  // open을 받으면 바깥이 조종, 아니면 직접 훅을 씀 (조종받을 땐 훅은 멈춰 둠)
  const controlled = openProp !== undefined
  const owned = useInGameNightSuccessPresentation({ hold: controlled || hold })

  const current = controlled ? currentProp : owned.current
  const open = controlled ? openProp : owned.open
  const finish = useCallback((outcome) => {
    if (controlled) {
      finishProp(outcome)
      return
    }
    owned.finish(outcome)
  }, [controlled, finishProp, owned.finish])
  const finalStatus = controlled ? finalStatusProp : owned.finalStatus
  const onClose = controlled ? onCloseProp : owned.onClose
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
