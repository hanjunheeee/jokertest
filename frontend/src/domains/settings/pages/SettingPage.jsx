// 파일 역할: SettingPage.jsx - 라우터에서 렌더링되는 페이지입니다.
import { useNavigate } from "react-router-dom"
import SettingBackButton from "@/domains/settings/components/SettingBackButton.jsx"
import SettingBackground from "@/domains/settings/components/SettingBackground.jsx"
import SettingIntroSkipLayer from "@/domains/settings/components/SettingIntroSkipLayer.jsx"
import SettingPanel from "@/domains/settings/components/SettingPanel.jsx"
import { useVideoIntro } from "../hooks/useVideoIntro.js"

export default function SettingPage() {
  const navigate = useNavigate()

  // 배경 인트로 영상 ref와 인트로 완료/건너뛰기 상태를 가져옵니다.
  const { bgVideoRef, introDone, skipIntro } = useVideoIntro()

  return (
    <div className="relative h-svh w-full overflow-hidden bg-black">
      <SettingBackground videoRef={bgVideoRef} />
      <SettingIntroSkipLayer visible={!introDone} onSkip={skipIntro} />
      <SettingPanel visible={introDone} />
      <SettingBackButton visible={introDone} onBack={() => navigate("/lobby")} />
    </div>
  )
}
