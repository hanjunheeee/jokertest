/**
 * 우하단 사운드 조절 UI.
 *
 * 볼륨·음소거 상태 관리는 useAudioControl에 위임합니다.
 * 이 컴포넌트는 슬라이더·아이콘 렌더와 UI 이벤트를 훅으로 전달하는 역할만 합니다.
 *
 * props
 * - audioRef: HTMLAudioElement | HTMLVideoElement ref — 훅을 통해 volume·muted가 동기화됩니다.
 *             audioRef 없이 렌더하면 UI만 표시되고 실제 볼륨에는 영향을 주지 않습니다.
 */
import { SOUND_CONTROL_ASSETS } from "@/shared/constants/soundControlAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { useAudioControl } from "@/shared/hooks/useAudioControl.js"

const ICON_SIZE_CLASS = "w-[clamp(2.85rem,3.9vw,3.5rem)]"
const BAR_WIDTH_CLASS = "w-[clamp(10.75rem,14.8vw,13.5rem)]"
const ICON_OVERLAP_CLASS = "-mr-[16%]"
const BAR_OFFSET_CLASS = "translate-x-[clamp(0.35rem,1.1vw,0.55rem)]"
const KNOT_INSET_PERCENT = { start: 20, end: 8 }

const SLIDER_BAR_CLASS = "block h-auto w-full select-none"
const SLIDER_KNOT_WRAP_CLASS =
  "pointer-events-none absolute top-1/2 z-10 w-[24%] max-w-[1.15rem] min-w-[0.9rem] -translate-x-1/2 -translate-y-1/2"

const SLIDER_KNOT_IMG_CLASS = "block h-auto w-full select-none"

/** sliderValue(0~1)를 노브의 left % 위치로 변환합니다 (양쪽 여백 제외). */
function knotLeftPercent(value) {
  const travel = 100 - KNOT_INSET_PERCENT.start - KNOT_INSET_PERCENT.end
  return KNOT_INSET_PERCENT.start + value * travel
}

export default function SoundControl({ audioRef }) {
  // sliderValue: 음소거 중에는 0 고정 (UI 슬라이더 위치 제어)
  // isSilent: 아이콘 전환 기준 (음소거 or 볼륨 0)
  const { sliderValue, isSilent, onVolumeChange, toggleMute } = useAudioControl(audioRef)

  const percent = Math.round(sliderValue * 100) // aria-valuenow용 정수 퍼센트
  const knotLeft = knotLeftPercent(sliderValue) // 노브 left % 계산

  return (
    <div
      className="flex items-center"
      role="group"
      aria-label="사운드 조절"
    >
      {/* 음소거 토글 버튼 — isSilent에 따라 아이콘 전환 */}
      <button
        type="button"
        onClick={toggleMute}
        className={`relative z-10 shrink-0 ${ICON_SIZE_CLASS} ${ICON_OVERLAP_CLASS} cursor-pointer border-0 bg-transparent p-0 leading-none transition-opacity hover:opacity-90`}
        aria-label={isSilent ? "음소거 해제" : "음소거"}
        aria-pressed={isSilent}
      >
        <PublicAsset
          src={
            isSilent
              ? SOUND_CONTROL_ASSETS.noSoundIcon
              : SOUND_CONTROL_ASSETS.soundOnIcon
          }
          alt=""
          className="block h-auto w-full select-none"
        />
      </button>

      <div className={`relative shrink-0 ${BAR_WIDTH_CLASS} ${BAR_OFFSET_CLASS}`}>
        <PublicAsset
          src={SOUND_CONTROL_ASSETS.sliderBar}
          alt=""
          className={SLIDER_BAR_CLASS}
        />
        {/* opacity-0 range input이 클릭·드래그를 받고, 노브 이미지는 style로 위치를 맞춤 */}
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={sliderValue}
          onChange={(event) => onVolumeChange(Number(event.target.value))}
          className="peer absolute inset-0 z-20 h-full w-full cursor-pointer opacity-0"
          aria-label="배경음 볼륨"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
        />
        <span
          className={SLIDER_KNOT_WRAP_CLASS}
          style={{ left: `${knotLeft}%` }} // sliderValue에 따라 노브 위치 갱신
          aria-hidden="true"
        >
          <span className="interactive-scale-peer-sm block w-full">
            <PublicAsset
              src={SOUND_CONTROL_ASSETS.sliderKnot}
              alt=""
              className={SLIDER_KNOT_IMG_CLASS}
            />
          </span>
        </span>
      </div>
    </div>
  )
}
