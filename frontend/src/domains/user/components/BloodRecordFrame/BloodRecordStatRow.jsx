import {
  BLOOD_RECORD_ROW_LABEL_CLASS,
  BLOOD_RECORD_ROW_VALUE_CLASS,
  BLOOD_RECORD_TEXT_SHADOW,
} from "../../constants/myPageLayoutStyle.js"

export default function BloodRecordStatRow({ label, value, showDivider }) {
  return (
    <div className="flex flex-col gap-[0.35em]">
      {showDivider ? (
        <div className="h-px shrink-0 bg-gradient-to-r from-transparent via-[#6b3a2a]/55 to-transparent" aria-hidden="true" />
      ) : null}

      <div className="flex items-center justify-between gap-[0.5em] py-[0.15em]">
        <span className={BLOOD_RECORD_ROW_LABEL_CLASS} style={{ textShadow: BLOOD_RECORD_TEXT_SHADOW }}>
          {label}
        </span>

        <span className={BLOOD_RECORD_ROW_VALUE_CLASS} style={{ textShadow: BLOOD_RECORD_TEXT_SHADOW }}>
          {value}
        </span>
      </div>
    </div>
  )
}
