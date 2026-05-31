import { BLOOD_RECORD_STATS, MY_PAGE_ASSETS } from "../constants/myPageAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset"

const TEXT_SHADOW =
  "0 1px 2px rgba(255,255,255,0.35), 0 1px 3px rgba(0,0,0,0.5)"

/** 양피지 본문 영역 (프레임 PNG 기준) */
const CONTENT_INSET = {
  top: "24%",
  bottom: "14%",
  left: "15%",
  right: "15%",
}

const ROW_LABEL_CLASS =
  "font-subheading text-[3.6cqi] font-bold leading-none text-[#3d1810]"
const ROW_VALUE_CLASS =
  "font-subheading text-[3.8cqi] font-bold leading-none tracking-wide text-[#2a0e08] tabular-nums"

function StatRow({ label, value, showDivider }) {
  return (
    <div className="flex flex-col gap-[0.35em]">
      {showDivider ? (
        <div
          className="h-px shrink-0 bg-gradient-to-r from-transparent via-[#6b3a2a]/55 to-transparent"
          aria-hidden="true"
        />
      ) : null}
      <div className="flex items-center justify-between gap-[0.5em] py-[0.15em]">
        <span className={ROW_LABEL_CLASS} style={{ textShadow: TEXT_SHADOW }}>
          {label}
        </span>
        <span className={ROW_VALUE_CLASS} style={{ textShadow: TEXT_SHADOW }}>
          {value}
        </span>
      </div>
    </div>
  )
}

/**
 * 마이페이지 피의 기록 프레임 (prototype 피의 기록 영역)
 */
export default function BloodRecordFrame({
  src = MY_PAGE_ASSETS.bloodRecordFrame,
  stats = BLOOD_RECORD_STATS,
  showText = true,
  className = "block h-auto w-full shrink-0 select-none",
}) {
  return (
    <div className="relative block w-full [container-type:inline-size]">
      <PublicAsset src={src} alt="" className={className} />

      {showText ? (
        <div
          className="pointer-events-none absolute flex flex-col justify-evenly gap-[0.2em]"
          style={CONTENT_INSET}
        >
          {stats.map((row, index) => (
            <StatRow
              key={row.label}
              label={row.label}
              value={row.value}
              showDivider={index > 0}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}
