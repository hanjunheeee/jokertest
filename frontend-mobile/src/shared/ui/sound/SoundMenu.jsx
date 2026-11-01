// 위 줄 소리 아이콘 + 눌러서 펼치는 배경음 조절 창
// 모드 선택·방 목록·마이페이지 위 줄이 씀
import { useState } from "react"
import { SOUND_CONTROL_ASSETS } from "@/shared/constants/soundControlAssets.js"
import { useAudioControl } from "@/shared/hooks/useAudioControl.js"
import { getGlobalBgmRef } from "@/shared/hooks/useBgmRuntime.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import SoundGroup from "@m/shared/ui/sound/SoundGroup.jsx"
import { SOUND_MENU_LOOKS } from "@m/shared/ui/sound/soundLooks.js"

// 아이콘은 지금 소리 상태, 바깥을 누르면 닫힘 (폰 폭엔 막대를 늘 펼칠 자리가 없음)
export default function SoundMenu({ look }) {
  const menu = SOUND_MENU_LOOKS[look]
  const control = useAudioControl(getGlobalBgmRef())
  const [open, setOpen] = useState(false)
  const icon = control.isSilent ? SOUND_CONTROL_ASSETS.noSoundIcon : SOUND_CONTROL_ASSETS.soundOnIcon
  const group = <SoundGroup control={control} look={menu.control} />

  return (
    <div className={menu.root}>
      <button
        type="button"
        aria-label={menu.openLabel}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={menu.opener}
      >
        <PublicAsset src={icon} alt="" className={menu.control.icon} />
      </button>

      {open ? (
        <>
          <button type="button" aria-label="사운드 조절 닫기" className={menu.backdrop} onClick={() => setOpen(false)} />
          {menu.panel ? <div className={menu.panel}>{group}</div> : group}
        </>
      ) : null}
    </div>
  )
}
