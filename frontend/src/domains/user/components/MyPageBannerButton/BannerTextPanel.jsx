import {
  MY_PAGE_BANNER_LABEL_TEXT_CLASS,
  MY_PAGE_BANNER_TEXT_ALIGN_LEFT_CLASS,
  MY_PAGE_BANNER_TEXT_SHADOW,
} from "../../constants/myPageBannerStyle.js"

export default function BannerTextPanel({ profile, textPanelInset }) {
  const { nickname } = profile

  return (
    <div className="pointer-events-none absolute flex items-center" style={textPanelInset}>
      <p
        className={`relative ${MY_PAGE_BANNER_TEXT_ALIGN_LEFT_CLASS} max-w-full [overflow-wrap:anywhere] ${MY_PAGE_BANNER_LABEL_TEXT_CLASS}`}
        style={{ textShadow: MY_PAGE_BANNER_TEXT_SHADOW }}
      >
        {nickname}
      </p>
    </div>
  )
}
