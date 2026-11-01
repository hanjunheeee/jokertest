// 인게임 위 줄: 나가기·전적 목록·설정·내 역할 보기 (데스크톱 InGameTopControls와 같은 순서·그림·이름)
// InGamePage가 씀, 날짜·단계 글은 진행 바(Timebar)가 보여 줘서 여기엔 없음
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { NAVIGATION_ASSETS } from "@/shared/constants/navigationAssets.js"
import { INGAME_CONTROLS_ASSETS } from "@/domains/game/ingame/constants/controls/ingameControlsAssets.js"

// 내 역할 보기 그림·이름 (데스크톱 InGameTopControls와 같은 값)
const ROLE_REVEAL_SRC = "/button/직업모달 표시버튼2.png".normalize("NFD")
const ROLE_REVEAL_LABEL = "내 역할 보기"

// 누를 자리 44px 그림 버튼
const BTN_CLASS =
  "flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent p-0 leading-none active:scale-95"

// 그림 버튼 하나 (sfxOwner가 explicit이면 공용 클릭음 빠짐)
function IconButton({ label, src, onClick, sfxOwner, imgClassName = "h-10 w-10" }) {
  return (
    <button
      type="button"
      aria-label={label}
      data-sfx-owner={sfxOwner}
      onClick={onClick}
      className={BTN_CLASS}
      style={{ outline: "none" }}
    >
      <PublicAsset src={src} alt="" className={`block select-none object-contain ${imgClassName}`} />
    </button>
  )
}

// 위 줄 (나가기는 확인 창에서 소리를 따로 내서 공용 클릭음 뺌, 역할 보기는 역할 받은 뒤에만)
export default function TopBar({ onExit, onRecords, onSettings, onRoleReveal, roleRevealAvailable }) {
  return (
    <div className="flex h-12 shrink-0 items-center gap-1 px-1.5 land:h-11" aria-label="인게임 컨트롤">
      <IconButton label="게임 나가기" sfxOwner="explicit" src={NAVIGATION_ASSETS.backButton} onClick={onExit} />
      <IconButton label="플레이어별 전적목록" src={INGAME_CONTROLS_ASSETS.menu} onClick={onRecords} />
      <IconButton label="인게임 설정" src={INGAME_CONTROLS_ASSETS.settings} onClick={onSettings} />
      {roleRevealAvailable ? (
        <IconButton label={ROLE_REVEAL_LABEL} src={ROLE_REVEAL_SRC} onClick={onRoleReveal} imgClassName="h-9 w-9" />
      ) : null}
    </div>
  )
}
