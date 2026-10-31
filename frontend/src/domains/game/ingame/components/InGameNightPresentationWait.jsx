import InGameParchmentPanelBase from "./parchment/InGameParchmentPanelBase.js"
import { INGAME_NIGHT_PRIVATE_RESULT_MESSAGE_CLASS } from "../constants/nightPrivateResult/ingameNightPrivateResult.js"

export const INGAME_NIGHT_PRESENTATION_WAIT_MESSAGE = "진행을 기다리는 중입니다."

const INGAME_NIGHT_PRESENTATION_WAIT_BACKDROP_CLASS = "fixed inset-0 z-[65] bg-black/70"

const INGAME_NIGHT_PRESENTATION_WAIT_PANEL_WRAP_CLASS =
  "fixed inset-0 z-[66] flex items-center justify-center overflow-hidden px-[clamp(0.5rem,3vw,2rem)] py-[clamp(0.5rem,3vh,2rem)]"

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
