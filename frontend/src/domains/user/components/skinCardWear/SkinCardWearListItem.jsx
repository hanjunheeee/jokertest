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
