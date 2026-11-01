// 밤 성공 자료 대기 창: 영상 자료가 없는 종류는 대기 문구와 확인 버튼만
// 밤 성공 연출(InGameNightSuccessPresentation)이 영상 자료가 없을 때 띄움
import InGameParchmentModalBase from "../parchment/InGameParchmentModalBase.js"
import InGameParchmentConfirmButton from "../parchment/InGameParchmentConfirmButton.js"
import { buildPendingAssetLabel } from "../../constants/ingameNightSuccess.js"
import { PRIVATE_RESULT_MSG_CLASS } from "../../constants/ingameNightPrivateResult.js"

export default function InGameNightSuccessPendingAsset({ type, eventId, onFinish }) {
  const label = buildPendingAssetLabel(type)
  if (label === null) return null

  // 바깥을 눌러 닫으면 건너뜀, 확인을 누르면 다 본 것
  return (
    <InGameParchmentModalBase
      variantKey="nightPrivateResult"
      onDismiss={() => onFinish("SKIPPED")}
      showConfirm={false}
      focusKey={eventId}
      wrapperProps={{ "data-ingame-night-success-pending": "" }}
    >
      <p className={PRIVATE_RESULT_MSG_CLASS}>{label}</p>
      <InGameParchmentConfirmButton label="확인" onClick={() => onFinish("COMPLETED")} />
    </InGameParchmentModalBase>
  )
}
