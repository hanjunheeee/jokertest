// 파일 역할: GameSetupCreateButton.jsx - 화면을 구성하는 컴포넌트입니다.
import { GAME_SETUP_ASSETS } from "../constants/gameSetupAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset"

const CREATE_GAME_BTN_CLASS =
  "interactive-scale relative mx-auto mt-[clamp(0.55rem,1.2vh,0.85rem)] block w-[clamp(13.5rem,20vw,17.5rem)] shrink-0 cursor-pointer border-0 bg-transparent p-0 leading-none transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:opacity-60"

const CREATE_GAME_LABEL_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center whitespace-nowrap font-subheading text-[clamp(1.22rem,1.75vw,1.42rem)] font-bold tracking-tight text-[#f5f0e6] [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]"

/**
 * 설정 완료 후 방을 만드는 버튼입니다.
 * 생성 요청이 진행 중인 동안 disabled로 중복 클릭을 막습니다 — 이건 UX 보조일 뿐이고,
 * 실제 동시 요청 방지는 서버의 pendingRoomTransitions 잠금이 담당한다.
 */
export default function GameSetupCreateButton({ onClick, disabled = false }) {
  return (
    <button
      type="button"
      aria-label="게임 만들기"
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
      <span className={CREATE_GAME_LABEL_CLASS}>게임 만들기</span>
    </button>
  )
}
