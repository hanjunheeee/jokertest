// 그림 체크박스 (그림 30px, 누르는 칸 48px)
// settings/CheckRow.jsx·RoomRow.jsx가 씀, 그림은 데스크톱 인게임 설정 체크 칸 그대로
import { INGAME_SETTING_ASSETS } from "@/domains/game/ingame/constants/controls/ingameSetting/ingameSettingAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

// 그림보다 넓은 투명 칸으로 손가락 빗나감 줄임
export default function CheckBox({ checked, onChange, ariaLabel }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
      className="-mr-2 flex size-12 shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent p-0"
    >
      <span className="relative block w-[1.9rem]">
        <PublicAsset src={INGAME_SETTING_ASSETS.checkbox} alt="" className="block h-auto w-full select-none" />
        {/* 켜졌을 때만 체크 표시 */}
        {checked ? (
          <PublicAsset
            src={INGAME_SETTING_ASSETS.checkMark}
            alt=""
            className="pointer-events-none absolute inset-[12%] block h-auto w-[76%] select-none"
          />
        ) : null}
      </span>
    </button>
  )
}
