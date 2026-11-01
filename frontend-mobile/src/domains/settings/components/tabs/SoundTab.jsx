// 설정 사운드 탭 (마스터·배경음·효과음 음량 + 효과음 음소거)
// layout/SettingContent.jsx가 씀
import { SOUND_SETTING_VOLUMES } from "@/shared/constants/soundSettings.js"
import { useSoundSettings } from "@/shared/hooks/useSoundSettings.js"
import SliderRow from "../rows/SliderRow.jsx"
import ToggleRow from "../rows/ToggleRow.jsx"

const SFX_MUTE_LABEL = "효과음 음소거"

// 값·바꾸기는 데스크톱 useSoundSettings (인게임 설정 창과 같은 값)
export default function SoundTab() {
    const { volumes, setVolume, sfxMuted, setSfxMuted } = useSoundSettings()

    return (
        <div className="flex flex-col">
            {SOUND_SETTING_VOLUMES.map(({ id, label, min, max }) => (
                <SliderRow
                    key={id}
                    label={label}
                    min={min}
                    max={max}
                    value={volumes[id]}
                    onChange={(next) => setVolume(id, next)}
                />
            ))}
            {/* 효과음만 따로 끄기 */}
            <ToggleRow label={SFX_MUTE_LABEL} checked={sfxMuted} onChange={setSfxMuted} />
        </div>
    )
}
