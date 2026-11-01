// 인증 화면 오른쪽 아래 소리 조절 (데스크톱 AuthSceneChrome의 오른쪽 아래 구석)
// login/scene/Scene.jsx가 액자 아래에 씀
import SoundControl from "@m/shared/ui/sound/SoundControl.jsx"

// 세로 화면은 액자 아래 줄 오른쪽(액자를 안 가림), 가로 화면은 액자 옆 빈자리 구석에 고정
export default function SoundCorner() {
  return (
    <div className="relative z-10 flex shrink-0 justify-end px-3 pb-3 land:fixed land:bottom-2 land:right-4 land:p-0! md:px-6 md:pb-6">
      <SoundControl look="login" />
    </div>
  )
}
