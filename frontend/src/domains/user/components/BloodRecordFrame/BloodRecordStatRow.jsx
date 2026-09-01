import {
  BLOOD_RECORD_ROW_LABEL_CLASS,
  BLOOD_RECORD_ROW_VALUE_CLASS,
  BLOOD_RECORD_TEXT_SHADOW,
} from "@/domains/user/constants/myPageLayoutStyle.js"

export default function BloodRecordStatRow({ label, value, showDivider }) {
  return (
    <div className="flex flex-col gap-[0.35em]">
      {/* 첫 줄을 제외한 기록 사이에 구분선을 보여줍니다. */}
      {showDivider ? (
        <div className="h-px shrink-0 bg-gradient-to-r from-transparent via-[#6b3a2a]/55 to-transparent" aria-hidden="true" />
      ) : null}

      <div className="flex items-center justify-between gap-[0.5em] py-[0.15em]">
        {/* 기록 이름입니다. 예: 전체 판수, 생존 횟수 */}
        <span className={BLOOD_RECORD_ROW_LABEL_CLASS} style={{ textShadow: BLOOD_RECORD_TEXT_SHADOW }}>
          {label}
        </span>

        {/* 기록 값입니다. 숫자 폭이 흔들리지 않도록 tabular-nums 스타일을 씁니다. */}
        <span className={BLOOD_RECORD_ROW_VALUE_CLASS} style={{ textShadow: BLOOD_RECORD_TEXT_SHADOW }}>
          {value}
        </span>
      </div>
    </div>
  )
}
