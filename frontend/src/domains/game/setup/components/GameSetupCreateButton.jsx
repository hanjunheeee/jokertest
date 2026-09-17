// 파일 역할: GameSetupCreateButton.jsx - 화면을 구성하는 컴포넌트입니다.
import { GAME_SETUP_ASSETS } from "../constants/gameSetupAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset"

const CREATE_GAME_BTN_CLASS =
  "interactive-scale relative mx-auto mt-[clamp(0.55rem,1.2vh,0.85rem)] block w-[clamp(13.5rem,20vw,17.5rem)] shrink-0 cursor-pointer border-0 bg-transparent p-0 leading-none transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:opacity-60"

const CREATE_GAME_LABEL_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center whitespace-nowrap font-subheading app-text-scaled [--app-text-size:clamp(1.22rem,1.75vw,1.42rem)] font-bold tracking-tight text-[#f5f0e6] [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]"

/**
 * 설정 완료 후 방을 만드는 버튼입니다.
 * 생성 요청이 진행 중인 동안 disabled로 중복 클릭을 막습니다 — 이건 UX 보조일 뿐이고,
 * 실제 동시 요청 방지는 서버의 pendingRoomTransitions 잠금이 담당한다.
 */
export default function GameSetupCreateButton({
  onClick,
  disabled = false,
  // F-20: 같은 버튼을 방 생성과 설정 저장 두 모드에서 쓴다. 라벨과 aria-label을 갈라 두면
  // 저장 화면에서 "게임 만들기"를 읽어주는 어긋남이 생기므로 호출부가 함께 넘긴다.
  label = "게임 만들기",
  ariaLabel = label,
  // 진행 중일 때 보여줄 라벨. 주지 않으면 라벨은 그대로 두고 disabled로만 표시한다.
  busy = false,
  busyLabel = null,
}) {
  const displayLabel = busy && busyLabel ? busyLabel : label
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-busy={busy || undefined}
      onClick={onClick}
      disabled={disabled}
      className={CREATE_GAME_BTN_CLASS}
      style={{ outline: "none" }}
    >
      <PublicAsset
        src={GAME_SETUP_ASSETS.createGameButton}
        alt=""
        className="block h-auto w-full select-none"
      />
      <span className={CREATE_GAME_LABEL_CLASS}>{displayLabel}</span>
    </button>
  )
}
