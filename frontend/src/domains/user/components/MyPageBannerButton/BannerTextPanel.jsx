import {
  MY_PAGE_BANNER_LABEL_TEXT_CLASS,
  MY_PAGE_BANNER_REPUTATION_TEXT_CLASS,
  MY_PAGE_BANNER_TEXT_ALIGN_LEFT_CLASS,
  MY_PAGE_BANNER_TEXT_INSET_LEFT,
  MY_PAGE_BANNER_TEXT_SHADOW,
} from "@/domains/user/constants/myPageBannerStyle.js"

function StatusDivider() {
  return (
    <div
      className="-translate-y-[0.18rem] mr-[12%] h-px shrink-0 bg-gradient-to-r from-[#c8b898]/65 via-[#c8b898]/45 to-transparent"
      style={{ marginLeft: MY_PAGE_BANNER_TEXT_INSET_LEFT }}
      aria-hidden="true"
    />
  )
}

/** 배너 이미지 위에 닉네임·명성을 올려 보여주는 영역 */
export default function BannerTextPanel({ profile, textPanelInset }) {
  const { reputationLabel, reputationValue } = profile

  return (
    <div className="pointer-events-none absolute grid grid-rows-[1fr_auto_1fr]" style={textPanelInset}>
      <div className="relative h-full min-h-0 w-full">
        <p
          className={`absolute ${MY_PAGE_BANNER_TEXT_ALIGN_LEFT_CLASS} top-[44%] -translate-y-1/2 ${MY_PAGE_BANNER_LABEL_TEXT_CLASS}`}
          style={{ textShadow: MY_PAGE_BANNER_TEXT_SHADOW }}
        >
          {reputationLabel}
        </p>
      </div>

      <StatusDivider />

      <div className="relative h-full min-h-0 w-full">
        <p
          className={`absolute ${MY_PAGE_BANNER_TEXT_ALIGN_LEFT_CLASS} top-[8%] ${MY_PAGE_BANNER_REPUTATION_TEXT_CLASS}`}
          style={{ textShadow: MY_PAGE_BANNER_TEXT_SHADOW }}
        >
          명성 {reputationValue}
        </p>
      </div>
    </div>
  )
}
