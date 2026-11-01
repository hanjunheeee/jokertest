// 배경음 조절 (음소거 아이콘 + 그림 막대), 데스크톱 SoundControl의 모바일판
// 로그인·계정 찾기·로비 바닥 줄·방 설정 위 줄이 씀
import { useAudioControl } from "@/shared/hooks/useAudioControl.js"
import { getGlobalBgmRef } from "@/shared/hooks/useBgmRuntime.js"
import SoundGroup from "@m/shared/ui/sound/SoundGroup.jsx"
import { SOUND_LOOKS } from "@m/shared/ui/sound/soundLooks.js"

// 값·동작은 데스크톱 useAudioControl 그대로, 크기만 look 이름으로 고름
export default function SoundControl({ look, audioRef = getGlobalBgmRef() }) {
  const control = useAudioControl(audioRef)
  return <SoundGroup control={control} look={SOUND_LOOKS[look]} />
}
