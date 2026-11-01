// 배너 닉네임 글자 칸
// BannerMainButton이 씀
import {
  LABEL_TEXT_CLASS,
  TEXT_ALIGN_LEFT_CLASS,
  TEXT_SHADOW,
} from "../../constants/myPageBannerStyle.js"

// 글자 칸 자리는 받은 inset으로 정함
export default function BannerTextPanel({ profile, textPanelInset }) {
  const { nickname } = profile

  return (
    <div className="pointer-events-none absolute flex items-center" style={textPanelInset}>
      <p
        className={`relative ${TEXT_ALIGN_LEFT_CLASS} max-w-full [overflow-wrap:anywhere] ${LABEL_TEXT_CLASS}`}
        style={{ textShadow: TEXT_SHADOW }}
      >
        {nickname}
      </p>
    </div>
  )
}
