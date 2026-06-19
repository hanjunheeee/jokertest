/**
 * 마이페이지 배너 버튼.
 *
 * 프로필/대표 이미지처럼 클릭 가능한 배너형 UI 조각을 렌더링합니다.
 */
import { LOBBY_ASSETS, MY_PAGE_PROFILE } from "@/domains/lobby/constants/lobbyAssets.js"
import {
  LOBBY_BANNER_WIDTH_CLASS,
  LOBBY_TEXT_PANEL_INSET,
} from "@/domains/user/constants/myPageBannerLayout.js"
import PublicAsset from "@/shared/ui/PublicAsset"

const TEXT_SHADOW =
  "0 1px 2px rgba(0,0,0,0.9), 0 0 10px rgba(0,0,0,0.45)"

/** 상·하단 텍스트·구분선 좌측 시작점 통일 (미세 조정 전 과하게 왼쪽) */
const TEXT_INSET_LEFT = "-4%"
const TEXT_ALIGN_LEFT = "left-[-4%]"

/** 배너 너비에 비례하는 텍스트 (로비·마이페이지 동일 비율) */
const LABEL_TEXT_CLASS =
  "font-subheading text-[4.4cqi] font-bold leading-tight text-[#ebe2cc]"
const REPUTATION_TEXT_CLASS =
  "font-subheading text-[4cqi] font-bold leading-tight text-[#e5dcc4]"
const TITLE_TEXT_CLASS =
  "font-subheading text-[3.5cqi] font-bold leading-tight text-[#d8cdb8]"

function StatusDivider() {
  return (
    <div
      className="mr-[12%] h-px shrink-0 bg-gradient-to-r from-[#c8b898]/65 via-[#c8b898]/45 to-transparent"
      style={{ marginLeft: TEXT_INSET_LEFT }}
      aria-hidden="true"
    />
  )
}

export default function MyPageBannerButton({
  onClick,
  profile = MY_PAGE_PROFILE,
  showText = true,
  bannerSrc = LOBBY_ASSETS.myPageButton,
  textPanelInset = LOBBY_TEXT_PANEL_INSET,
  className = LOBBY_BANNER_WIDTH_CLASS,
}) {
  const { reputationLabel, reputationValue, title } = profile
  const isInteractive = typeof onClick === "function"
  const Root = isInteractive ? "button" : "div"

  return (
    <Root
      type={isInteractive ? "button" : undefined}
      aria-label={isInteractive ? "마이페이지" : undefined}
      onClick={onClick}
      className={`relative block [container-type:inline-size] leading-none ${
        isInteractive ? "interactive-scale" : "border-0 bg-transparent p-0"
      } ${className}`}
    >
      <PublicAsset
        src={bannerSrc}
        alt=""
        className="block h-auto w-full select-none"
      />

      {showText ? (
        <div
          className="pointer-events-none absolute grid grid-rows-[1fr_auto_1fr]"
          style={textPanelInset}
        >
          <div className="relative h-full min-h-0 w-full">
            <p
              className={`absolute ${TEXT_ALIGN_LEFT} top-1/2 -translate-y-1/2 ${LABEL_TEXT_CLASS}`}
              style={{ textShadow: TEXT_SHADOW }}
            >
              {reputationLabel}
            </p>
          </div>

          <StatusDivider />

          <div className="relative h-full min-h-0 w-full">
            <p
              className={`absolute ${TEXT_ALIGN_LEFT} top-[14%] ${REPUTATION_TEXT_CLASS}`}
              style={{ textShadow: TEXT_SHADOW }}
            >
              명성 {reputationValue}
            </p>
            <p
              className={`absolute left-[52%] top-[13%] max-w-[52%] truncate text-left ${TITLE_TEXT_CLASS}`}
              style={{ textShadow: TEXT_SHADOW }}
            >
              {title}
            </p>
          </div>
        </div>
      ) : null}
    </Root>
  )
}
