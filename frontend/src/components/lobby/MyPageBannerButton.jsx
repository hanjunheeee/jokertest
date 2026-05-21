import { LOBBY_ASSETS, MY_PAGE_PROFILE } from "../../assets/lobbyAssets.js"
import PublicAsset from "../login/PublicAsset.jsx"

const TEXT_SHADOW =
  "0 1px 2px rgba(0,0,0,0.9), 0 0 10px rgba(0,0,0,0.45)"

/** 상·하단 텍스트·구분선 좌측 시작점 통일 (미세 조정 전 과하게 왼쪽) */
const TEXT_INSET_LEFT = "-4%"
const TEXT_ALIGN_LEFT = "left-[-4%]"

/** prototype2(로비) — 배너 내 초상화 제외 텍스트 패널 */
export const LOBBY_TEXT_PANEL_INSET = {
  top: "20%",
  bottom: "17%",
  left: "34%",
  right: "5%",
}

/** 로비·마이페이지 배너 동일 너비 (!: 루트 w-full과 충돌 방지) */
export const LOBBY_BANNER_WIDTH_CLASS =
  "!w-[clamp(18rem,26vw,30rem)] max-w-full shrink-0"

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
      className={`relative block [container-type:inline-size] border-0 bg-transparent p-0 leading-none ${
        isInteractive ? "cursor-pointer" : ""
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
