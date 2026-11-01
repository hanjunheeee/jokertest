// 스킨·카드 목록 칸 하나 (썸네일·이름·종류·착용 체크)
// ItemGrid가 씀
import { SKIN_CARD_WEAR_ASSETS } from "@/domains/user/constants/skinCardWear/skinCardWearAssets.js"
import { ITEM_KIND_LABEL } from "@/domains/user/constants/skinCardWear/skinCardWearLayout.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

// 종류 글자: 카드·기본 스킨·스킨 (데스크톱과 같음)
const kindLabelOf = (item) => {
  if (item.itemType === "card") return ITEM_KIND_LABEL.card
  if (item.source === "basic") return ITEM_KIND_LABEL.basic
  return ITEM_KIND_LABEL.premium
}

// 미보유면 잠그고 흐리게, 착용 중이면 체크 표시
export default function ItemButton({ item, selected, equipped, owned, onSelect }) {
  const ariaLabel = equipped ? `${item.name}, 착용 중` : owned ? item.name : `${item.name}, 미보유`

  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={ariaLabel}
      disabled={!owned}
      onClick={() => { if (owned) onSelect(item) }}
      className={`flex min-h-14 w-full min-w-0 items-center gap-2 rounded-md border p-1.5 text-left transition-colors active:bg-[#1a1008]/60 disabled:opacity-40 ${
        selected ? "border-[#c9a227]/55 bg-[#1a1008]/60 ring-1 ring-[#d4af37]/30" : "border-[#c9a227]/12 bg-black/25"
      }`}
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-md border border-[#1a1008]/22 bg-[#1a1008]/30">
        <PublicAsset src={item.listIcon} alt="" className="block h-[90%] w-[90%] select-none object-contain" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="block truncate font-subheading text-sm font-bold text-[#ebe2cc] [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]">
          {item.name}
        </span>
        <span className="block truncate font-subheading text-[0.68rem] font-semibold text-[#c9a227]/82">
          {owned ? kindLabelOf(item) : "미보유"}
        </span>
      </span>
      {equipped ? (
        <PublicAsset src={SKIN_CARD_WEAR_ASSETS.checkMark} alt="" aria-hidden="true" className="h-4 w-4 shrink-0 select-none object-contain" />
      ) : null}
    </button>
  )
}
