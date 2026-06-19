/**
 * 설정 페이지.
 *
 * page 계층은 훅·컴포넌트 조합과 네비게이션 제어만 담당합니다.
 * - 배경 영상 인트로 제어 → useVideoIntro (bgVideoRef, introDone, skipIntro)
 * - 설정 내용 → SettingPanel (introDone을 visible로 받아 페이드인)
 */
import { useNavigate } from "react-router-dom"
import SettingPanel from "@/domains/settings/components/SettingPanel.jsx"
import MotionBackButton from "@/shared/ui/MotionBackButton.jsx"
import { BACK_BUTTON_PAGE_POSITION_CLASS } from "@/shared/constants/navigationLayout.js"
import { SETTING_ASSETS } from "../constants/settingAssets.js"
import { publicAsset } from "@/shared/utils/publicAsset"
import { useVideoIntro } from "../hooks/useVideoIntro.js"
import { UI_REVEAL_TRANSITION } from "@/shared/constants/pageTransitions.js"

export default function SettingPage() {
  const navigate = useNavigate()

  // 배경 영상 인트로 제어 — bgVideoRef는 훅 내부에서 관리, introDone이 true가 되면 UI 전환
  const { bgVideoRef, introDone, skipIntro } = useVideoIntro()

  return (
    <div className="relative h-svh w-full overflow-hidden bg-black">
      {/* bgVideoRef를 연결 — 훅이 timeupdate·ended 이벤트로 인트로 종료를 감지 */}
      <video
        ref={bgVideoRef}
        src={publicAsset(SETTING_ASSETS.bgVideo)}
        autoPlay
        muted
        playsInline
        preload="auto"
        className="absolute inset-0 h-full w-full object-cover object-center"
      />

      {/* 인트로 중에만 렌더 — 클릭 시 즉시 skipIntro 호출 */}
      {!introDone ? (
        <button
          type="button"
          aria-label="인트로 건너뛰기"
          onClick={skipIntro}
          className="absolute inset-0 z-30 cursor-pointer border-0 bg-transparent p-0"
        />
      ) : null}

      {/* introDone을 visible로 전달 — 패널 내부에서 페이드인 애니메이션 처리 */}
      <SettingPanel visible={introDone} />

      {/* introDone 기준으로 뒤로가기 버튼도 동일 타이밍에 등장 */}
      <MotionBackButton
        initial={{ opacity: 0, y: 8 }}
        animate={introDone ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
        transition={UI_REVEAL_TRANSITION}
        onClick={() => navigate("/lobby")}
        className={`${BACK_BUTTON_PAGE_POSITION_CLASS} z-30`}
        style={{ pointerEvents: introDone ? "auto" : "none" }} // 인트로 중 클릭 차단
      />
    </div>
  )
}
