// 설정 체크 줄: 제목·설명 + 체크 상자 (setup은 줄 전체, sheet는 상자만 누름)
// SettingList가 씀, 체크 그림은 데스크톱 설정 화면과 같음
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { GAME_SETUP_ASSETS } from "@/domains/game/setup/constants/gameSetupAssets.js"
import { SETTING_LOOKS } from "./settingLooks.js"
import SettingRow, { RowText } from "./SettingRow.jsx"

// 상자 그림 + 체크 표시
function Box({ checked, className }) {
  return (
    <span className={className}>
      <PublicAsset src={GAME_SETUP_ASSETS.checkbox} alt="" className="block h-auto w-full select-none" />
      {checked ? (
        <PublicAsset
          src={GAME_SETUP_ASSETS.checkMark}
          alt=""
          className="pointer-events-none absolute inset-[12%] block h-auto w-[76%] select-none"
        />
      ) : null}
    </span>
  )
}

// 체크 줄 (누르면 반대 값으로 onChange)
export default function CheckRow({ look: lookName, label, description, checked, onChange }) {
  const look = SETTING_LOOKS[lookName]
  const toggle = { role: "checkbox", "aria-checked": checked, "aria-label": label, onClick: () => onChange(!checked) }

  if (look.wholeRowCheck) {
    return (
      <button
        type="button"
        {...toggle}
        className={`${look.row} w-full flex-nowrap border-x-0 border-t-0 bg-transparent px-0 text-left`}
        data-setup-row
      >
        <RowText look={look} label={label} description={description} inline />
        <span className="flex size-11 shrink-0 items-center justify-center">
          <Box checked={checked} className="relative block w-7 transition-transform active:scale-90" />
        </span>
      </button>
    )
  }

  return (
    <SettingRow look={lookName} label={label} description={description}>
      <button
        type="button"
        {...toggle}
        className="flex h-11 w-11 cursor-pointer items-center justify-center border-0 bg-transparent p-0 active:scale-90"
      >
        <Box checked={checked} className="relative block w-7" />
      </button>
    </SettingRow>
  )
}
