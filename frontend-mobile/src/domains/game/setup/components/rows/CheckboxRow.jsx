// 설정 체크 줄: 제목·설명 + 체크 상자 (줄 전체를 눌러도 바뀜)
// SetupList가 씀
import PublicAsset from "@/shared/ui/PublicAsset"
import { GAME_SETUP_ASSETS } from "@/domains/game/setup/constants/gameSetupAssets.js"
import { DESC_CLASS, ROW_CLASS, ROW_TEXT_CLASS, TITLE_CLASS } from "../../constants/setupLayout.js"

// 체크 줄 (누르면 반대 값으로 onChange)
export default function CheckboxRow({ label, description, checked, onChange }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`${ROW_CLASS} w-full flex-nowrap border-x-0 border-t-0 bg-transparent px-0 text-left`}
      data-setup-row
    >
      <span className={ROW_TEXT_CLASS}>
        <span className={`block ${TITLE_CLASS}`}>{label}</span>
        {description ? <span className={`block ${DESC_CLASS}`}>{description}</span> : null}
      </span>
      <span className="flex size-11 shrink-0 items-center justify-center">
        <span className="relative block w-7 transition-transform active:scale-90">
          <PublicAsset src={GAME_SETUP_ASSETS.checkbox} alt="" className="block h-auto w-full select-none" />
          {checked ? (
            <PublicAsset
              src={GAME_SETUP_ASSETS.checkMark}
              alt=""
              className="pointer-events-none absolute inset-[12%] block h-auto w-[76%] select-none"
            />
          ) : null}
        </span>
      </span>
    </button>
  )
}
