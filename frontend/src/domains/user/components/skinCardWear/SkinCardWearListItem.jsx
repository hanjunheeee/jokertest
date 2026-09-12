import PublicAsset from "../../../../shared/ui/PublicAsset.jsx"
import { SKIN_CARD_WEAR_ASSETS } from "../../constants/skinCardWear/skinCardWearAssets.js"
import { isSkinCardWearItemEquipped } from "../../constants/skinCardWear/skinCardWearCatalog.js"
import {
  SKIN_CARD_WEAR_ITEM_KIND_LABEL,
  SKIN_CARD_WEAR_LIST_ITEM_BTN_CLASS,
  SKIN_CARD_WEAR_LIST_ITEM_BTN_SELECTED_CLASS,
  SKIN_CARD_WEAR_LIST_ITEM_EQUIPPED_CHECK_CLASS,
  SKIN_CARD_WEAR_LIST_ITEM_KIND_CLASS,
  SKIN_CARD_WEAR_LIST_ITEM_NAME_CLASS,
  SKIN_CARD_WEAR_LIST_ITEM_TEXT_WRAP_CLASS,
  SKIN_CARD_WEAR_LIST_ITEM_THUMB_CLASS,
  SKIN_CARD_WEAR_LIST_ITEM_THUMB_WRAP_CLASS,
} from "../../constants/skinCardWear/skinCardWearLayout.js"

function resolveItemKindLabel(item) {
  if (item.itemType === "card") return SKIN_CARD_WEAR_ITEM_KIND_LABEL.card
  if (item.source === "basic") return SKIN_CARD_WEAR_ITEM_KIND_LABEL.basic
  return SKIN_CARD_WEAR_ITEM_KIND_LABEL.premium
}

export default function SkinCardWearListItem({
  item,
  selected,
  equipped,
  // F-14(AC-02, R-IMPL P1 "actual list ownership contract"): 미보유 항목은 disabled 처리해
  // 선택 자체가 불가능해야 한다(네이티브 button[disabled]은 클릭 이벤트를 아예 발생시키지
  // 않는다) — useSkinCardWearSelection.js의 selectItem 방어선과 함께 이중으로 막는다.
  owned = true,
  onSelect,
}) {
  const ariaLabel = equipped
    ? `${item.name}, 착용 중`
    : owned
      ? item.name
      : `${item.name}, 미보유`

  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={ariaLabel}
      disabled={!owned}
      aria-disabled={!owned}
      onClick={() => { if (owned) onSelect(item) }}
      className={`${SKIN_CARD_WEAR_LIST_ITEM_BTN_CLASS} ${selected ? SKIN_CARD_WEAR_LIST_ITEM_BTN_SELECTED_CLASS : ""}`}
      style={{ outline: "none", opacity: owned ? 1 : 0.4, cursor: owned ? "pointer" : "not-allowed" }}
    >
      <span className={SKIN_CARD_WEAR_LIST_ITEM_THUMB_WRAP_CLASS}>
        <PublicAsset src={item.listIcon} alt="" className={SKIN_CARD_WEAR_LIST_ITEM_THUMB_CLASS} />
      </span>

      <span className={SKIN_CARD_WEAR_LIST_ITEM_TEXT_WRAP_CLASS}>
        <span className={SKIN_CARD_WEAR_LIST_ITEM_NAME_CLASS}>{item.name}</span>
        <span className={SKIN_CARD_WEAR_LIST_ITEM_KIND_CLASS}>
          {owned ? resolveItemKindLabel(item) : "미보유"}
        </span>
      </span>

      {equipped ? (
        <PublicAsset
          src={SKIN_CARD_WEAR_ASSETS.checkMark}
          alt=""
          aria-hidden="true"
          className={SKIN_CARD_WEAR_LIST_ITEM_EQUIPPED_CHECK_CLASS}
        />
      ) : null}
    </button>
  )
}
