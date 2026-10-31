import { GAME_SETUP_ASSETS } from "../../constants/gameSetupAssets.js"
import {
  SETUP_DESC_CLASS,
  SETUP_ROW_CLASS,
  SETUP_TITLE_CLASS,
} from "../../constants/setupRowStyles.js"
import Stepper from "@/shared/ui/Stepper"

export default function SetupChoiceRow({ label, description, options, value, onChange }) {
  const index = Math.max(0, options.findIndex((option) => option.value === value)) // 없으면 첫 칸

  return (
    <div className={SETUP_ROW_CLASS} data-setup-row>
      <div className="min-w-0 flex-1">
        <p className={SETUP_TITLE_CLASS}>{label}</p>
        {description ? <p className={SETUP_DESC_CLASS}>{description}</p> : null}
      </div>

      <Stepper
        options={options.map((option) => option.label)}
        index={index}
        onIndexChange={(nextIndex) => onChange(options[nextIndex].value)}
        ariaLabel={label}
        inputFieldSrc={GAME_SETUP_ASSETS.inputField}
        arrowSrc={GAME_SETUP_ASSETS.arrow}
        valueClassName="pointer-events-none absolute inset-0 flex items-center justify-center font-subheading app-text-scaled [--app-text-size:clamp(1.02rem,1.45vw,1.18rem)] font-bold text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]"
        valueWidthClassName="relative w-[clamp(6.25rem,10.5vw,7.5rem)]"
        buttonClassName="group block w-[clamp(1.9rem,2.55vw,2.15rem)] cursor-pointer border-0 bg-transparent p-0 disabled:cursor-default disabled:opacity-40"
        arrowWrapClassName="interactive-scale-sm block"
        arrowImageClassName="block h-auto w-full select-none"
      />
    </div>
  )
}
