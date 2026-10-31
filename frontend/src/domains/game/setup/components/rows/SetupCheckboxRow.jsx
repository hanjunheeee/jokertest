import { GAME_SETUP_ASSETS } from "../../constants/gameSetupAssets.js"
import {
  SETUP_DESC_CLASS,
  SETUP_ROW_CLASS,
  SETUP_TITLE_CLASS,
} from "../../constants/setupRowStyles.js"
import PublicAsset from "@/shared/ui/PublicAsset"

export default function SetupCheckboxRow({ label, description, checked, onChange }) {
  return (
    <div className={SETUP_ROW_CLASS} data-setup-row>
      <div className="min-w-0 flex-1">
        <p className={SETUP_TITLE_CLASS}>{label}</p>
        {description ? <p className={SETUP_DESC_CLASS}>{description}</p> : null}
      </div>
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className="group relative mt-px block w-[clamp(1.5rem,2.1vw,1.75rem)] shrink-0 cursor-pointer border-0 bg-transparent p-0 leading-none"
        style={{ outline: "none" }}
      >
        <span className="interactive-scale-sm relative block">
          <PublicAsset
            src={GAME_SETUP_ASSETS.checkbox}
            alt=""
            className="block h-auto w-full select-none"
          />
          {checked ? (
            <PublicAsset
              src={GAME_SETUP_ASSETS.checkMark}
              alt=""
              className="pointer-events-none absolute inset-[12%] block h-auto w-[76%] select-none"
            />
          ) : null}
        </span>
      </button>
    </div>
  )
}
