/**
 * 마이페이지 배너 버튼.
 *
 * 프로필/대표 이미지처럼 클릭 가능한 배너형 UI 조각을 렌더링합니다.
 * showSettingsIcon 시 설정 톱니는 별도 버튼으로 분리해 배너와 독립 hover·클릭.
 */
import { LOBBY_ASSETS, MY_PAGE_PROFILE } from "@/domains/lobby/constants/lobbyAssets.js"
import {
  LOBBY_BANNER_WIDTH_CLASS,
  LOBBY_SETTINGS_GEAR_LAYOUT,
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

const ROOT_CLASS =
  "relative block [container-type:inline-size] leading-none"

const SETTINGS_BTN_CLASS =
  "group absolute z-10 cursor-pointer border-0 bg-transparent p-0 leading-none"

const SETTINGS_GEAR_IMG_CLASS =
  "interactive-scale-sm block h-full w-full select-none object-contain"

function StatusDivider() {
  return (
    <div
      className="mr-[12%] h-px shrink-0 bg-gradient-to-r from-[#c8b898]/65 via-[#c8b898]/45 to-transparent"
      style={{ marginLeft: TEXT_INSET_LEFT }}
      aria-hidden="true"
    />
  )
}

/** profile: { reputationLabel, reputationValue, title } / textPanelInset: 텍스트 배치용 top·bottom·left·right 값 */
function BannerTextPanel({ profile, textPanelInset }) {
  const { reputationLabel, reputationValue, title } = profile

  return (
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
  )
}

/** onClick: 설정 톱니 클릭 시 호출할 콜백 (버블링을 막아 배너 본체 클릭과 분리) */
function SettingsGearButton({ onClick }) {
  return (
    <button
      type="button"
      aria-label="계정 설정"
      onClick={(event) => {
        event.stopPropagation()
        onClick?.()
      }}
      className={SETTINGS_BTN_CLASS}
      style={{
        top: LOBBY_SETTINGS_GEAR_LAYOUT.top,
        right: LOBBY_SETTINGS_GEAR_LAYOUT.right,
        width: LOBBY_SETTINGS_GEAR_LAYOUT.size,
        height: LOBBY_SETTINGS_GEAR_LAYOUT.size,
      }}
    >
      <PublicAsset
        src={LOBBY_ASSETS.settingsGear}
        alt=""
        className={SETTINGS_GEAR_IMG_CLASS}
      />
    </button>
  )
}

// onClick: 배너 클릭 시 호출할 콜백 (없으면 클릭 불가능한 div로 렌더링)
// bannerSrc: 배너 이미지 경로 / showText: 텍스트 패널 표시 여부
// profile, textPanelInset: BannerTextPanel에 그대로 전달
function BannerMainButton({ onClick, bannerSrc, showText, profile, textPanelInset, className }) {
  const isInteractive = typeof onClick === "function"
  const Root = isInteractive ? "button" : "div"

  return (
    <Root
      type={isInteractive ? "button" : undefined}
      aria-label={isInteractive ? "마이페이지" : undefined}
      onClick={onClick}
      className={`${ROOT_CLASS} ${
        isInteractive ? "interactive-scale w-full border-0 bg-transparent p-0" : "w-full"
      } ${className}`}
    >
      <PublicAsset
        src={bannerSrc}
        alt=""
        className="block h-auto w-full select-none"
      />
      {showText ? (
        <BannerTextPanel profile={profile} textPanelInset={textPanelInset} />
      ) : null}
    </Root>
  )
}

export default function MyPageBannerButton({
  onClick, // 배너 전체 클릭 시 호출할 콜백 (예: 마이페이지로 이동)
  onSettingsClick, // 설정 톱니 클릭 시 호출할 콜백. showSettingsIcon과 함께 있어야 톱니가 보임
  profile = MY_PAGE_PROFILE, // 배너에 표시할 { reputationLabel, reputationValue, title }
  showText = true, // false면 배너 이미지만 그리고 텍스트 패널은 숨김
  showSettingsIcon = false, // true + onSettingsClick 존재 시 설정 톱니 버튼을 별도로 렌더링
  bannerSrc = LOBBY_ASSETS.myPageButton, // 배너 이미지 경로
  textPanelInset = LOBBY_TEXT_PANEL_INSET, // 텍스트 패널 배치용 top·bottom·left·right 값
  className = LOBBY_BANNER_WIDTH_CLASS, // 배너 루트에 적용할 클래스
}) {
  // 톱니를 별도 버튼으로 분리해야 하는지 여부 (배너 클릭과 별개로 hover·클릭되도록)
  const hasSettingsControl = showSettingsIcon && typeof onSettingsClick === "function"

  if (hasSettingsControl) {
    return (
      <div className={`${ROOT_CLASS} ${className}`}>
        <BannerMainButton
          onClick={onClick}
          bannerSrc={bannerSrc}
          showText={showText}
          profile={profile}
          textPanelInset={textPanelInset}
          className="!w-full"
        />
        <SettingsGearButton onClick={onSettingsClick} />
      </div>
    )
  }

  return (
    <BannerMainButton
      onClick={onClick}
      bannerSrc={bannerSrc}
      showText={showText}
      profile={profile}
      textPanelInset={textPanelInset}
      className={className}
    />
  )
}
