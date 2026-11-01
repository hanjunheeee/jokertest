// 보유 이모티콘 판 하나 (누르면 고른 칸에 넣음, 이름은 판 아래 글자)
// Grid가 씀
import { EMOTICON_PALETTE_ASSETS } from "@/domains/user/constants/emoticonPaletteAssets.js"
import {
  PLATE_ICON_CLASS,
  PLATE_ICON_WRAP_CLASS,
  PLATE_IMG_CLASS,
  PLATE_INNER_CLASS,
  PLATE_UNOWNED_BTN_CLASS,
  PLATE_UNOWNED_INNER_CLASS,
  PLATE_UNOWNED_OVERLAY_CLASS,
} from "@/domains/user/constants/emoticonPaletteLayoutStyle.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

// 데스크톱 판 버튼에서 고정 폭만 칸 폭으로 바꿈
const BTN_CLASS =
  "group relative z-0 flex w-full cursor-pointer flex-col items-center gap-0.5 overflow-visible border-0 bg-transparent p-[0.2rem] leading-none disabled:cursor-not-allowed disabled:opacity-45"

// 글자색은 데스크톱 이름표 글자(PLATE_NAMEPLATE_LABEL_CLASS)와 같음
const NAME_CLASS =
  "block w-full truncate text-center font-subheading text-[0.72rem] font-bold leading-tight text-[#ebe2cc]/95 [text-shadow:0_1px_2px_rgba(0,0,0,0.9)]"

// 터치엔 마우스 따라오는 이름표가 없어서 이름을 판 아래에 늘 보임, 미보유는 어둡게 잠금
export default function Plate({ item, owned, disabled, onAssign }) {
  return (
    <button
      type="button"
      disabled={disabled || !owned}
      onClick={() => onAssign(item.id)}
      aria-label={owned ? `${item.name} 팔레트에 넣기` : `${item.name} (미보유)`}
      className={`${BTN_CLASS} ${owned ? "" : PLATE_UNOWNED_BTN_CLASS}`.trim()}
    >
      <span className={`${PLATE_INNER_CLASS} ${owned ? "" : PLATE_UNOWNED_INNER_CLASS}`.trim()}>
        <PublicAsset src={EMOTICON_PALETTE_ASSETS.plate} alt="" className={PLATE_IMG_CLASS} />
        {!owned ? <span aria-hidden="true" className={PLATE_UNOWNED_OVERLAY_CLASS} /> : null}
        <span className={PLATE_ICON_WRAP_CLASS}>
          <PublicAsset src={item.icon} alt={item.name} className={PLATE_ICON_CLASS} />
        </span>
      </span>
      <span aria-hidden="true" className={`${NAME_CLASS} ${owned ? "" : "opacity-55"}`}>
        {item.name}
      </span>
    </button>
  )
}
