import BannerTextPanel from "@/domains/user/components/MyPageBannerButton/BannerTextPanel.jsx"
import { MY_PAGE_BANNER_ROOT_CLASS } from "@/domains/user/constants/myPageBannerStyle.js"
import PublicAsset from "@/shared/ui/PublicAsset"

// 배너 이미지 자체를 그리는 컴포넌트입니다.
// 클릭 가능한 배너로 쓸 수도 있고, 단순 이미지 배너로만 쓸 수도 있습니다.
export default function BannerMainButton({ onClick, bannerSrc, showText, profile, textPanelInset, className }) {
  // 클릭 함수가 있으면 버튼으로 만들고, 없으면 단순 배너 div로 보여줍니다.
  const isInteractive = typeof onClick === "function"

  // JSX 태그 이름을 변수로 정해서 button/div 중 하나를 렌더링합니다.
  const Root = isInteractive ? "button" : "div"

  return (
    <Root
      type={isInteractive ? "button" : undefined}
      aria-label={isInteractive ? "마이페이지" : undefined}
      onClick={onClick}
      className={`${MY_PAGE_BANNER_ROOT_CLASS} ${isInteractive ? "interactive-scale w-full border-0 bg-transparent p-0" : "w-full"} ${className}`}
    >
      {/* 배너 배경 이미지입니다. */}
      <PublicAsset src={bannerSrc} alt="" className="block h-auto w-full select-none" />

      {/* showText가 true일 때만 배너 위에 프로필 텍스트를 올립니다. */}
      {showText ? <BannerTextPanel profile={profile} textPanelInset={textPanelInset} /> : null}
    </Root>
  )
}
