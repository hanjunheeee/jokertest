import { INGAME_CONTROLS_ASSETS } from "../../constants/controls/ingameControlsAssets.js"
import {
  INGAME_CONTROL_BTN_CLASS,
  INGAME_CONTROL_BTN_IMG_CLASS,
  INGAME_ROLE_REVEAL_BTN_IMG_CLASS,
  INGAME_TOP_CONTROLS_POSITION_CLASS,
} from "../../constants/controls/ingameControlsLayout.js"
import PublicAsset from "@/shared/ui/PublicAsset"
import { NAVIGATION_ASSETS } from "@/shared/constants/navigationAssets.js"

function ControlButton({
  ariaLabel,
  src,
  onClick,
  sfxOwner,
  imgClassName = INGAME_CONTROL_BTN_IMG_CLASS,
}) {
  return (
    <button
      type="button"
      data-sfx-owner={sfxOwner}
      aria-label={ariaLabel}
      onClick={onClick}
      className={INGAME_CONTROL_BTN_CLASS}
      style={{ outline: "none" }}
    >
      <PublicAsset src={src} alt="" className={imgClassName} />
    </button>
  )
}

export const INGAME_ROLE_REVEAL_BUTTON_SRC = "/button/직업모달 표시버튼2.png".normalize("NFD")

export const INGAME_ROLE_REVEAL_BUTTON_LABEL = "내 역할 보기"

export default function InGameTopControls({
  onExitClick,
  onMenuClick,
  onSettingsClick,
  onOpenRoleReveal,
  roleRevealAvailable = false,
  className = INGAME_TOP_CONTROLS_POSITION_CLASS,
}) {
  return (
    <div className={className} aria-label="인게임 컨트롤">
      <ControlButton
        sfxOwner="explicit"
        ariaLabel="게임 나가기"
        src={NAVIGATION_ASSETS.backButton}
        onClick={onExitClick}
      />
      <ControlButton
        ariaLabel="플레이어별 전적목록"
        src={INGAME_CONTROLS_ASSETS.menu}
        onClick={onMenuClick}
      />
      <ControlButton
        ariaLabel="인게임 설정"
        src={INGAME_CONTROLS_ASSETS.settings}
        onClick={onSettingsClick}
      />
      {roleRevealAvailable ? (
        <ControlButton
          ariaLabel={INGAME_ROLE_REVEAL_BUTTON_LABEL}
          src={INGAME_ROLE_REVEAL_BUTTON_SRC}
          imgClassName={INGAME_ROLE_REVEAL_BTN_IMG_CLASS}
          onClick={onOpenRoleReveal}
        />
      ) : null}
    </div>
  )
}
