// 설정 체크 줄: 제목·설명 + 체크 상자 (누를 자리 44px)
// SettingsItemList가 씀, 체크 그림은 데스크톱 설정 화면과 같음
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { GAME_SETUP_ASSETS } from "@/domains/game/setup/constants/gameSetupAssets.js"
import SettingRow from "./SettingRow.jsx"

// 체크 줄 (누르면 반대 값으로 onChange)
export default function CheckRow({ label, description, checked, onChange }) {
  return (
    <SettingRow label={label} description={description}>
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className="flex h-11 w-11 cursor-pointer items-center justify-center border-0 bg-transparent p-0 active:scale-90"
      >
        <span className="relative block w-7">
          <PublicAsset src={GAME_SETUP_ASSETS.checkbox} alt="" className="block h-auto w-full select-none" />
          {checked ? (
            <PublicAsset
              src={GAME_SETUP_ASSETS.checkMark}
              alt=""
              className="pointer-events-none absolute inset-[12%] block h-auto w-[76%] select-none"
            />
          ) : null}
        </span>
      </button>
    </SettingRow>
  )
}
