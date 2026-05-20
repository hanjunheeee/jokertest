import { useState } from "react"
import { GENERAL_SETTINGS, SETTING_ASSETS } from "../../../assets/settingAssets.js"
import PublicAsset from "../../login/PublicAsset.jsx"

const ROW_CLASS =
  "flex shrink-0 items-center justify-between gap-[clamp(1rem,2.5vw,2rem)] border-b border-[#c4a574]/35 py-[clamp(0.35rem,0.85vh,0.5rem)] last:border-b-0"

const LABEL_CLASS =
  "min-w-0 flex-1 font-subheading text-[clamp(1.02rem,1.5vw,1.18rem)] font-bold leading-snug text-[#140c08]"

const INPUT_VALUE_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center font-subheading text-[clamp(0.98rem,1.35vw,1.08rem)] text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]"

const DROPDOWN_WIDTH_CLASS = "w-[clamp(11.5rem,24vw,15rem)]"
const STEPPER_VALUE_WIDTH_CLASS = "w-[clamp(7.25rem,13vw,9.25rem)]"

function SettingCheckbox({ label, checked, onChange }) {
  return (
    <div className={ROW_CLASS} data-setting-row>
      <span className={LABEL_CLASS}>{label}</span>
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className="relative block w-[clamp(1.75rem,2.45vw,2rem)] shrink-0 cursor-pointer border-0 bg-transparent p-0"
      >
        <PublicAsset
          src={SETTING_ASSETS.checkbox}
          alt=""
          className="block h-auto w-full select-none"
        />
        {checked ? (
          <PublicAsset
            src={SETTING_ASSETS.checkMark}
            alt=""
            className="pointer-events-none absolute inset-[12%] block h-auto w-[76%] select-none"
          />
        ) : null}
      </button>
    </div>
  )
}

function SettingDropdown({ label, value }) {
  return (
    <div className={ROW_CLASS} data-setting-row>
      <span className={LABEL_CLASS}>{label}</span>
      <div className={`relative shrink-0 ${DROPDOWN_WIDTH_CLASS}`}>
        <PublicAsset
          src={SETTING_ASSETS.inputField}
          alt=""
          className="block h-auto w-full select-none"
        />
        <span className="pointer-events-none absolute inset-0 flex items-center justify-between px-4 font-subheading text-[clamp(0.98rem,1.35vw,1.08rem)] text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]">
          <span>{value}</span>
          <span className="text-[0.8rem] opacity-90">▼</span>
        </span>
      </div>
    </div>
  )
}

function SettingStepper({ label, options, defaultIndex = 0 }) {
  const [index, setIndex] = useState(defaultIndex)
  const value = options[index]
  const atMin = index === 0
  const atMax = index === options.length - 1

  return (
    <div className={ROW_CLASS} data-setting-row>
      <span className={LABEL_CLASS}>{label}</span>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          aria-label={`${label} 감소`}
          disabled={atMin}
          onClick={() => setIndex((prev) => Math.max(0, prev - 1))}
          className="block w-[clamp(1.9rem,2.55vw,2.15rem)] cursor-pointer border-0 bg-transparent p-0 opacity-90 hover:opacity-100 disabled:cursor-default disabled:opacity-40"
        >
          <PublicAsset
            src={SETTING_ASSETS.arrow}
            alt=""
            className="block h-auto w-full select-none"
          />
        </button>
        <div className={`relative ${STEPPER_VALUE_WIDTH_CLASS}`}>
          <PublicAsset
            src={SETTING_ASSETS.inputField}
            alt=""
            className="block h-auto w-full select-none"
          />
          <span className={INPUT_VALUE_CLASS}>{value}</span>
        </div>
        <button
          type="button"
          aria-label={`${label} 증가`}
          disabled={atMax}
          onClick={() =>
            setIndex((prev) => Math.min(options.length - 1, prev + 1))
          }
          className="block w-[clamp(1.9rem,2.55vw,2.15rem)] cursor-pointer border-0 bg-transparent p-0 opacity-90 hover:opacity-100 disabled:cursor-default disabled:opacity-40"
        >
          <PublicAsset
            src={SETTING_ASSETS.arrow}
            alt=""
            className="block h-auto w-full rotate-180 select-none"
          />
        </button>
      </div>
    </div>
  )
}

export default function GeneralSettingsTab() {
  const [checks, setChecks] = useState(() =>
    Object.fromEntries(
      GENERAL_SETTINGS.filter((item) => item.type === "checkbox").map((item) => [
        item.id,
        item.defaultChecked,
      ]),
    ),
  )

  return (
    <div className="flex h-full min-h-0 flex-col justify-between">
      {GENERAL_SETTINGS.map((item) => {
        if (item.type === "dropdown") {
          return (
            <SettingDropdown key={item.id} label={item.label} value={item.value} />
          )
        }
        if (item.type === "stepper") {
          return (
            <SettingStepper
              key={item.id}
              label={item.label}
              options={item.options}
              defaultIndex={item.defaultIndex}
            />
          )
        }
        return (
          <SettingCheckbox
            key={item.id}
            label={item.label}
            checked={checks[item.id]}
            onChange={(next) =>
              setChecks((prev) => ({ ...prev, [item.id]: next }))
            }
          />
        )
      })}
    </div>
  )
}
