/**
 * 로비 등에서 진입해 싱글/멀티/비밀연회장 중 하나를 고릅니다.
 * - 뒤로가기 → /lobby
 * - 멀티플레이 카드 → /multiplay
 * - 비밀연회장 카드 → /roomInvite (방 코드 입력)
 * - 싱글플레이 카드 → 아직 라우팅 없음
 *
 * UI 구성: ModeOptionCard(모드 카드), SoundControl(우하단), BackButton(좌하단)
 * 모드 목록·에셋 경로는 constants/modeAssets.js 참고
 */
import { useNavigate } from "react-router-dom"
import { GAME_MODES, MODE_SCREEN_ASSETS } from "../constants/modeAssets.js"
import ModeOptionCard from "../components/ModeOptionCard.jsx"
import BackButton, { BACK_BUTTON_PAGE_POSITION_CLASS } from "@/shared/ui/BackButton.jsx"
import SoundControl from "@/shared/ui/SoundControl.jsx"
import { publicAsset } from "@/shared/utils/publicAsset"

/** 게임 모드 카드 선택·네비게이션을 담당하는 페이지 컴포넌트 */
export default function GameModePage() {
  const navigate = useNavigate()

  /** 모드 id에 따라 다음 화면으로 이동 — 
   * multi: 멀티플레이 진입, secret-banquet: 방 코드 입력 */
  const handleModeSelect = (modeId) => {
    if (modeId === "multi") navigate("/multiplay")
    if (modeId === "secret-banquet") navigate("/roomInvite")
  }

  return (
    <div className="relative h-svh w-full overflow-hidden bg-black">
      <img
        src={publicAsset(MODE_SCREEN_ASSETS.bg)}
        alt=""
        className="absolute inset-0 h-full w-full object-cover object-center"
        draggable={false}
      />

      <div className="absolute inset-0 z-10">
        <div className="absolute bottom-4 right-4 sm:bottom-6 sm:right-6">
          <SoundControl />
        </div>

        <div
          className="absolute inset-x-0 top-[12%] bottom-[10%] flex items-center justify-center px-[clamp(1rem,4vw,3rem)] sm:top-[11%] sm:bottom-[9%]"
          role="group"
          aria-label="게임 모드 선택"
        >
          <div className="flex w-full max-w-[min(80rem,94vw)] items-stretch justify-center gap-[clamp(1.5rem,4.5vw,3.5rem)]">
            {GAME_MODES.map((mode) => (
              <ModeOptionCard
                key={mode.id}
                label={mode.label}
                frame={mode.frame}
                onSelect={() => handleModeSelect(mode.id)}
              />
            ))}
          </div>
        </div>

        <BackButton
          onClick={() => navigate("/lobby")}
          className={BACK_BUTTON_PAGE_POSITION_CLASS}
        />
      </div>
    </div>
  )
}
