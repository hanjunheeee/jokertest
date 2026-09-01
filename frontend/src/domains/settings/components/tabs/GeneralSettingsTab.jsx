import { useState } from "react"
import TutorialGuideOverlay from "@/shared/ui/tutorialGuide/TutorialGuideOverlay.jsx"
import {
  GENERAL_SETTING_ACTIONS,
  GENERAL_SETTING_CHECKBOXES,
  GENERAL_SETTING_SECTIONS,
  GENERAL_SETTING_TEXT_SIZE,
} from "../../constants/generalSettings.js"
import { SETTING_ASSETS } from "../../constants/settingAssets.js"
import CheckBox from "@/shared/ui/CheckBox"
import PublicAsset from "@/shared/ui/PublicAsset"
import RangeSlider from "@/shared/ui/RangeSlider"
import { useFullscreen } from "@/shared/hooks/useFullscreen.js"

const ROW_CLASS =
  "flex shrink-0 items-center justify-between gap-[clamp(1rem,2.5vw,2rem)] border-b border-[#c4a574]/35 py-[clamp(0.35rem,0.85vh,0.5rem)]"

const SECTION_TITLE_CLASS =
  "shrink-0 pt-[clamp(0.45rem,1vh,0.65rem)] font-subheading text-[clamp(0.88rem,1.15vw,1rem)] font-black tracking-wide text-[#3d2a1c]/72 first:pt-0"

const LABEL_CLASS =
  "min-w-0 flex-1 font-subheading text-[clamp(1.02rem,1.5vw,1.18rem)] font-bold leading-snug text-[#140c08]"

const ACTION_BTN_CLASS =
  "interactive-scale relative block w-[clamp(7.1rem,15vw,9.5rem)] shrink-0 cursor-pointer border-0 bg-transparent p-0 leading-none"

const ACTION_BTN_LABEL_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center px-[0.35rem] text-center font-subheading text-[clamp(0.72rem,1vw,0.88rem)] font-bold leading-tight text-[#f5f0e6] [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]"

function SettingActionButton({ label, onClick }) {
  return (
    <button type="button" onClick={onClick} className={ACTION_BTN_CLASS}>
      <PublicAsset
        src={SETTING_ASSETS.actionButton}
        alt=""
        className="block h-auto w-full select-none"
      />
      <span className={ACTION_BTN_LABEL_CLASS}>{label}</span>
    </button>
  )
}

function SettingCheckboxRow({ label, checked, onChange }) {
  return (
    <div className={ROW_CLASS} data-setting-row>
      <span className={LABEL_CLASS}>{label}</span>
      <CheckBox
        ariaLabel={label}
        checked={checked}
        onChange={onChange}
        checkboxSrc={SETTING_ASSETS.checkbox}
        checkMarkSrc={SETTING_ASSETS.checkMark}
      />
    </div>
  )
}

export default function GeneralSettingsTab() {
  const { isFullscreen, setFullscreen } = useFullscreen()
  const [checks, setChecks] = useState(() =>
    Object.fromEntries(
      GENERAL_SETTING_CHECKBOXES.filter(({ id }) => id !== "fullscreen").map(
        ({ id, defaultChecked }) => [id, defaultChecked],
      ),
    ),
  )
  const [textSize, setTextSize] = useState(GENERAL_SETTING_TEXT_SIZE.defaultValue)
  const [tutorialOpen, setTutorialOpen] = useState(false)

  const handleActionClick = (id) => {
    if (id === "replay-tutorial") {
      setTutorialOpen(true)
    }
  }

  const handleCheckboxChange = (id, next) => {
    if (id === "fullscreen") {
      void setFullscreen(next)
      return
    }
    setChecks((prev) => ({ ...prev, [id]: next }))
  }

  const isChecked = (id) => (id === "fullscreen" ? isFullscreen : checks[id])

  const screenItems = GENERAL_SETTING_CHECKBOXES.filter(({ section }) => section === "screen")
  const notificationItems = GENERAL_SETTING_CHECKBOXES.filter(
    ({ section }) => section === "notification",
  )

  return (
    <>
      <div className="flex min-h-0 flex-col pb-[clamp(0.35rem,0.85vh,0.5rem)]">
      <h3 className={SECTION_TITLE_CLASS}>{GENERAL_SETTING_SECTIONS.screen}</h3>
      {screenItems.map(({ id, label }) => (
        <SettingCheckboxRow
          key={id}
          label={label}
          checked={isChecked(id)}
          onChange={(next) => handleCheckboxChange(id, next)}
        />
      ))}

      <div className={ROW_CLASS} data-setting-row>
        <span className={LABEL_CLASS}>{GENERAL_SETTING_TEXT_SIZE.label}</span>
        <RangeSlider
          ariaLabel={GENERAL_SETTING_TEXT_SIZE.label}
          min={GENERAL_SETTING_TEXT_SIZE.min}
          max={GENERAL_SETTING_TEXT_SIZE.max}
          value={textSize}
          onChange={setTextSize}
        />
      </div>

      <h3 className={SECTION_TITLE_CLASS}>{GENERAL_SETTING_SECTIONS.notification}</h3>
      {notificationItems.map(({ id, label }) => (
        <SettingCheckboxRow
          key={id}
          label={label}
          checked={isChecked(id)}
          onChange={(next) => handleCheckboxChange(id, next)}
        />
      ))}

      <div
        className="shrink-0 h-[clamp(1.25rem,2.4vh,1.65rem)]"
        aria-hidden="true"
      />

      {GENERAL_SETTING_ACTIONS.map(({ id, label, buttonLabel }) => (
        <div key={id} className={`${ROW_CLASS} last:border-b-0`} data-setting-row>
          <span className={LABEL_CLASS}>{label}</span>
          <SettingActionButton
            label={buttonLabel}
            onClick={() => handleActionClick(id)}
          />
        </div>
      ))}
      </div>

      <TutorialGuideOverlay open={tutorialOpen} onClose={() => setTutorialOpen(false)} />
    </>
  )
}
