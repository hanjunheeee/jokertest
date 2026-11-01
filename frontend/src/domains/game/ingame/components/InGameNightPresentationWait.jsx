import InGameParchmentPanelBase from "./parchment/InGameParchmentPanelBase.js"
import { PRIVATE_RESULT_MSG_CLASS } from "../constants/ingameNightPrivateResult.js"

export const INGAME_NIGHT_PRESENTATION_WAIT_MESSAGE = "진행을 기다리는 중입니다."

const BACKDROP_CLASS = "fixed inset-0 z-[65] bg-black/70"

const PANEL_WRAP_CLASS =
  "fixed inset-0 z-[66] flex items-center justify-center overflow-hidden px-[clamp(0.5rem,3vw,2rem)] py-[clamp(0.5rem,3vh,2rem)]"

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
