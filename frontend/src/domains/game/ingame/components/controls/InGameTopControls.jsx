// 판 화면 왼쪽 위 버튼 줄: 나가기·전적 목록·설정·내 역할 보기
// InGamePage가 사용, 역할 보기 버튼 그림·이름은 시험도 가져감
import { INGAME_CONTROLS_ASSETS } from "../../constants/controls/ingameControlsAssets.js"
import {
  BTN_CLASS,
  BTN_IMG_CLASS,
  ROLE_REVEAL_BTN_IMG_CLASS,
  TOP_CONTROLS_POSITION_CLASS,
} from "../../constants/controls/ingameControlsLayout.js"
import PublicAsset from "@/shared/ui/PublicAsset"
import { NAVIGATION_ASSETS } from "@/shared/constants/navigationAssets.js"

// 그림 버튼 하나 (sfxOwner가 explicit이면 공용 클릭음 빠짐)
function ControlButton({
  ariaLabel,
  src,
  onClick,
  sfxOwner,
  imgClassName = BTN_IMG_CLASS,
}) {
  return (
    <button
      type="button"
      data-sfx-owner={sfxOwner}
      aria-label={ariaLabel}
      onClick={onClick}
      className={BTN_CLASS}
      style={{ outline: "none" }}
    >
      <PublicAsset src={src} alt="" className={imgClassName} />
    </button>
  )
}

// 내 역할 보기 버튼 그림·이름 (시험이 같은 값으로 버튼을 찾음)
export const INGAME_ROLE_REVEAL_BUTTON_SRC = "/button/직업모달 표시버튼2.png".normalize("NFD")

export const INGAME_ROLE_REVEAL_BUTTON_LABEL = "내 역할 보기"

// 버튼 줄: 누르면 받은 함수만 부름, 창 여닫기는 InGamePage 쪽이 맡음
export default function InGameTopControls({
  onExitClick,
  onMenuClick,
  onSettingsClick,
  onOpenRoleReveal,
  roleRevealAvailable = false,
  className = TOP_CONTROLS_POSITION_CLASS,
}) {
  // 나가기는 확인 창에서 고른 쪽 소리를 따로 내서 공용 클릭음 뺌
  // 내 역할 보기는 역할 정보를 받은 뒤에만 보임
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
          imgClassName={ROLE_REVEAL_BTN_IMG_CLASS}
          onClick={onOpenRoleReveal}
        />
      ) : null}
    </div>
  )
}
