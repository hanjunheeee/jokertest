// 배너 본체 (배너 그림 + 초상 + 닉네임 글자)
// MyPageBannerButton이 씀
import BannerProfilePortrait from "./BannerProfilePortrait.jsx"
import BannerTextPanel from "./BannerTextPanel.jsx"
import { ROOT_CLASS } from "../../constants/myPageBannerStyle.js"
import PublicAsset from "../../../../shared/ui/PublicAsset.jsx"

// 누름 처리가 있으면 버튼, 없으면 그냥 칸
export default function BannerMainButton({
  onClick,
  bannerSrc,
  bannerImageClassName = "block h-auto w-full select-none",
  showText,
  showProfilePortrait = false,
  profile,
  textPanelInset,
  className,
}) {
  const isInteractive = typeof onClick === "function"

  const Root = isInteractive ? "button" : "div"

  return (
    <Root
      type={isInteractive ? "button" : undefined}
      aria-label={isInteractive ? "마이페이지" : undefined}
      onClick={onClick}
      className={`${ROOT_CLASS} ${isInteractive ? "interactive-scale w-full border-0 bg-transparent p-0" : "w-full"} ${className}`}
    >
      <PublicAsset src={bannerSrc} alt="" className={bannerImageClassName} />

      {showProfilePortrait ? <BannerProfilePortrait /> : null}

      {showText ? <BannerTextPanel profile={profile} textPanelInset={textPanelInset} /> : null}
    </Root>
  )
}
