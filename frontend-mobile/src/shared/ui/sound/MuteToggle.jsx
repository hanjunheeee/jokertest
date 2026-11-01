// 배경음 켜고 끄기 아이콘만 (폰 폭에 막대 자리가 없는 위 줄용)
// 상점·대기방 위 줄이 씀
import { useAudioControl } from "@/shared/hooks/useAudioControl.js"
import { getGlobalBgmRef } from "@/shared/hooks/useBgmRuntime.js"
import MuteButton from "@m/shared/ui/sound/MuteButton.jsx"

// 값·동작은 데스크톱 useAudioControl 그대로, 크기는 부르는 쪽 class
export default function MuteToggle({ className, iconClassName, title = false, style }) {
  const control = useAudioControl(getGlobalBgmRef())
  return <MuteButton control={control} className={className} iconClassName={iconClassName} title={title} style={style} />
}
