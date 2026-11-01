// 보유 이모티콘 판 하나 (누르면 고른 칸에 넣음, 이름은 판 아래 글자)
// Grid가 씀
import { EMOTICON_PALETTE_ASSETS } from "@/domains/user/constants/emoticonPaletteAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

// 터치엔 마우스 따라오는 이름표가 없어서 이름을 판 아래에 늘 보임, 미보유는 어둡게 잠금
export default function Plate({ item, owned, disabled, onAssign }) {
  return (
    <button
      type="button"
      disabled={disabled || !owned}
      onClick={() => onAssign(item.id)}
      aria-label={owned ? `${item.name} 팔레트에 넣기` : `${item.name} (미보유)`}
      className={`group flex w-full flex-col items-center gap-0.5 border-0 bg-transparent p-0 leading-none ${
        owned ? "disabled:opacity-45" : ""
      }`}
    >
      <span
        className={`relative block w-full transition-transform duration-150 group-active:scale-95 ${
          owned ? "" : "opacity-55 brightness-[0.68] saturate-[0.72]"
        }`}
      >
        <PublicAsset src={EMOTICON_PALETTE_ASSETS.plate} alt="" className="block h-auto w-full select-none" />
        {!owned ? <span aria-hidden="true" className="absolute inset-0 bg-black/28" /> : null}
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center p-[18%]">
          <PublicAsset src={item.icon} alt="" className="max-h-full max-w-full select-none" />
        </span>
      </span>
      <span
        className={`block w-full truncate text-center font-subheading text-[0.7rem] font-bold [text-shadow:0_1px_2px_rgba(0,0,0,0.9)] ${
          owned ? "text-[#ebe2cc]" : "text-[#ebe2cc]/50"
        }`}
      >
        {item.name}
      </span>
    </button>
  )
}
