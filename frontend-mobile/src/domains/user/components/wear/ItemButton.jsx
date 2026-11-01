// 스킨·카드 목록 칸 하나 (썸네일·이름·종류·착용 체크)
// ItemGrid가 씀
import { SKIN_CARD_WEAR_ASSETS } from "@/domains/user/constants/skinCardWear/skinCardWearAssets.js"
import {
  ITEM_KIND_LABEL,
  LIST_ITEM_BTN_CLASS,
  LIST_ITEM_BTN_SELECTED_CLASS,
  LIST_ITEM_EQUIPPED_CHECK_CLASS,
  LIST_ITEM_KIND_CLASS,
  LIST_ITEM_NAME_CLASS,
  LIST_ITEM_TEXT_WRAP_CLASS,
  LIST_ITEM_THUMB_CLASS,
  LIST_ITEM_THUMB_WRAP_CLASS,
} from "@/domains/user/constants/skinCardWear/skinCardWearLayout.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

// 종류 글자: 카드·기본 스킨·스킨 (데스크톱과 같음)
const kindLabelOf = (item) => {
  if (item.itemType === "card") return ITEM_KIND_LABEL.card
  if (item.source === "basic") return ITEM_KIND_LABEL.basic
  return ITEM_KIND_LABEL.premium
}

// 데스크톱 항목 모양 그대로, 누르는 칸만 56px 이상
const BTN_CLASS = `${LIST_ITEM_BTN_CLASS} min-h-14 active:bg-[#1a1008]/28`

// 미보유면 잠그고 흐리게(데스크톱 0.4), 착용 중이면 체크 표시
export default function ItemButton({ item, selected, equipped, owned, onSelect }) {
  const ariaLabel = equipped ? `${item.name}, 착용 중` : owned ? item.name : `${item.name}, 미보유`

  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={ariaLabel}
      disabled={!owned}
      aria-disabled={!owned}
      onClick={() => { if (owned) onSelect(item) }}
      className={`${BTN_CLASS} ${selected ? LIST_ITEM_BTN_SELECTED_CLASS : ""}`}
      style={{ outline: "none", opacity: owned ? 1 : 0.4, cursor: owned ? "pointer" : "not-allowed" }}
    >
      <span className={LIST_ITEM_THUMB_WRAP_CLASS}>
        <PublicAsset src={item.listIcon} alt="" className={LIST_ITEM_THUMB_CLASS} />
      </span>
      <span className={LIST_ITEM_TEXT_WRAP_CLASS}>
        <span className={LIST_ITEM_NAME_CLASS}>{item.name}</span>
        <span className={LIST_ITEM_KIND_CLASS}>{owned ? kindLabelOf(item) : "미보유"}</span>
      </span>
      {equipped ? (
        <PublicAsset src={SKIN_CARD_WEAR_ASSETS.checkMark} alt="" aria-hidden="true" className={LIST_ITEM_EQUIPPED_CHECK_CLASS} />
      ) : null}
    </button>
  )
}
