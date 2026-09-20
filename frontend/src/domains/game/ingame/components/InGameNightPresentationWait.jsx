import InGameParchmentPanelBase from "./parchment/InGameParchmentPanelBase.js"
import { INGAME_NIGHT_PRIVATE_RESULT_MESSAGE_CLASS } from "../constants/nightPrivateResult/ingameNightPrivateResult.js"

/**
 * 대기 중 화면에 남는 **유일한** 문구. 그 밤에 무슨 일이 있었는지를 조금도 담지 않는다 —
 * 역할·대상·성공 여부가 문구의 차이로도 드러나면 그 자체가 부채널이다.
 */
export const INGAME_NIGHT_PRESENTATION_WAIT_MESSAGE = "진행을 기다리는 중입니다."

/** 아래 게임 표면을 완전히 덮는 차단 레이어(개인 결과 오버레이와 같은 z 단계다). */
const INGAME_NIGHT_PRESENTATION_WAIT_BACKDROP_CLASS = "fixed inset-0 z-[65] bg-black/70"

const INGAME_NIGHT_PRESENTATION_WAIT_PANEL_WRAP_CLASS =
  "fixed inset-0 z-[66] flex items-center justify-center overflow-hidden px-[clamp(0.5rem,3vw,2rem)] py-[clamp(0.5rem,3vh,2rem)]"

/**
 * F-27b(AC-01): 이 밤의 연출을 **하나도 받지 않는** 참가자에게만 뜨는 대기 화면.
 *
 * 이 화면이 보여주는 것은 고정 문구 하나뿐이다. 그 밤에 어떤 역할이 무엇을 했는지, 누가
 * 대상이었는지, 누가 성공했는지 — 어느 것도 props로 받지 않고 DOM에도 남기지 않는다. 받을 수
 * 있는 것은 "지금 띄워도 되는가"라는 boolean 하나이고, 그 판정은 페이지가 서버 대기 상태와
 * 현재 수신 범위로 한다.
 *
 * 스스로 끝나지 않는다: 버튼·타이머·ACK·오디오를 만들지 않으므로 사용자가 이 화면을 닫아
 * 서버 대기를 앞당길 방법이 없다. 해제 권한은 전적으로 서버에 있다(waiting:false 알림·다음
 * 역할 턴 시작·상한). 클릭 효과음이 붙어 있는 모달 셸(InGameParchmentModalBase) 대신 표시
 * 전용 양피지 패널을 쓰는 것도 같은 이유다 — 대기 중의 클릭·Escape가 어떤 소리도, 어떤 완료
 * 보고도 만들지 않아야 한다(AC-02).
 */
export default function InGameNightPresentationWait({ open }) {
  if (!open) return null

  return (
    <div
      className={INGAME_NIGHT_PRESENTATION_WAIT_BACKDROP_CLASS}
      data-ingame-night-presentation-wait="true"
    >
      <div className={INGAME_NIGHT_PRESENTATION_WAIT_PANEL_WRAP_CLASS}>
        <InGameParchmentPanelBase>
          <p className={INGAME_NIGHT_PRIVATE_RESULT_MESSAGE_CLASS}>
            {INGAME_NIGHT_PRESENTATION_WAIT_MESSAGE}
          </p>
        </InGameParchmentPanelBase>
      </div>
    </div>
  )
}
