// 밤 연출 대기 창: 다른 사람 밤 성공 연출이 끝날 때까지 띄우는 문구
// 인게임 화면이 사용 (열지 말지는 인게임 화면이 스토어 대기 알림으로 정함)
import InGameParchmentPanelBase from "./parchment/InGameParchmentPanelBase.js"
import { PRIVATE_RESULT_MSG_CLASS } from "../constants/ingameNightPrivateResult.js"

// 대기 문구 (시험도 이 값으로 화면 확인)
export const INGAME_NIGHT_PRESENTATION_WAIT_MESSAGE = "진행을 기다리는 중입니다."

// 화면 전체 덮어 뒤 조작 막기, 가운데에 양피지
const BACKDROP_CLASS = "fixed inset-0 z-[65] bg-black/70"

const PANEL_WRAP_CLASS =
  "fixed inset-0 z-[66] flex items-center justify-center overflow-hidden px-[clamp(0.5rem,3vw,2rem)] py-[clamp(0.5rem,3vh,2rem)]"

// 확인 버튼 없음, 대기 해제 알림이 오거나 밤이 끝나면 닫힘
export default function InGameNightPresentationWait({ open }) {
  if (!open) return null

  return (
    <div
      className={BACKDROP_CLASS}
      data-ingame-night-presentation-wait="true"
    >
      <div className={PANEL_WRAP_CLASS}>
        <InGameParchmentPanelBase>
          <p className={PRIVATE_RESULT_MSG_CLASS}>
            {INGAME_NIGHT_PRESENTATION_WAIT_MESSAGE}
          </p>
        </InGameParchmentPanelBase>
      </div>
    </div>
  )
}
