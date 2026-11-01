// 배경음 조절 한 줄 (음소거 버튼 + 그림 막대), 값은 받기만 함
// SoundControl·SoundMenu가 씀
import MuteButton from "@m/shared/ui/sound/MuteButton.jsx"
import VolumeBar from "@m/shared/ui/sound/VolumeBar.jsx"

// look = soundLooks.js 한 벌 (줄·버튼·아이콘·막대 class)
export default function SoundGroup({ control, look }) {
  return (
    <div className={look.group} role="group" aria-label="사운드 조절">
      <MuteButton control={control} className={look.button} iconClassName={look.icon} title={look.title} />
      <VolumeBar control={control} look={look} />
    </div>
  )
}
