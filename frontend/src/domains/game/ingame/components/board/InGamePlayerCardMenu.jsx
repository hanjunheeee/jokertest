import PublicAsset from "@/shared/ui/PublicAsset"
import { INGAME_PLAYER_CARD_OVERLAY_ASSETS } from "../../constants/board/ingamePlayerCardOverlayAssets.js"
import {
  INGAME_PLAYER_CARD_OVERLAY_ACTIONS_CLASS,
  INGAME_PLAYER_CARD_OVERLAY_BTN_CLASS,
  INGAME_PLAYER_CARD_OVERLAY_BTN_IMG_CLASS,
  INGAME_PLAYER_CARD_OVERLAY_BTN_LABEL_CLASS,
  INGAME_PLAYER_CARD_OVERLAY_SCRIM_CLASS,
  INGAME_PLAYER_CARD_OVERLAY_WRAP_CLASS,
} from "../../constants/board/ingamePlayerCardOverlayLayout.js"
import { INGAME_CARD_MENU_ITEM_KINDS } from "../../hooks/useInGamePlayerCardMenu.js"

/** 이 오버레이 전체를 가리키는 표식. 시험·e2e가 "메뉴가 떴는가"를 DOM 하나로 판정한다. */
export const INGAME_PLAYER_CARD_MENU_ATTR = "data-ingame-player-card-menu"

function resolveOverlayButtonAsset(kind) {
  if (
    kind === INGAME_CARD_MENU_ITEM_KINDS.DAY_VOTE_CANCEL
    || kind === INGAME_CARD_MENU_ITEM_KINDS.NIGHT_ACTION_CANCEL
    || kind === INGAME_CARD_MENU_ITEM_KINDS.TRIBUNAL_GUILTY
  ) {
    return INGAME_PLAYER_CARD_OVERLAY_ASSETS.cancelButton
  }
  return INGAME_PLAYER_CARD_OVERLAY_ASSETS.confirmButton
}

function OverlayImageButton({ label, assetSrc, disabled = false, disabledReason = null, onClick }) {
  return (
    <button
      type="button"
      role="menuitem"
      aria-label={label}
      title={disabled && disabledReason ? disabledReason : undefined}
      className={INGAME_PLAYER_CARD_OVERLAY_BTN_CLASS}
      disabled={disabled}
      onClick={onClick}
      style={{ outline: "none" }}
    >
      <PublicAsset src={assetSrc} alt="" className={INGAME_PLAYER_CARD_OVERLAY_BTN_IMG_CLASS} />
      <span className={INGAME_PLAYER_CARD_OVERLAY_BTN_LABEL_CLASS}>{label}</span>
    </button>
  )
}

/**
 * 플레이어 카드 좌클릭 행동 오버레이.
 *
 * 카드 하단 드롭다운 대신 카드 위에 어두운 scrim과 이미지 버튼을 겹친다.
 * 열림·닫힘·항목 계산·제출은 useInGamePlayerCardMenu가 소유한다.
 */
export default function InGamePlayerCardMenu({ items = [], onClose, menuRef }) {
  const visibleItems = items.filter((item) => item.visible !== false)
  const hasSingleCardAction = visibleItems.some(
    (item) => item.kind === INGAME_CARD_MENU_ITEM_KINDS.DAY_VOTE
      || item.kind === INGAME_CARD_MENU_ITEM_KINDS.DAY_VOTE_CANCEL
      || item.kind === INGAME_CARD_MENU_ITEM_KINDS.NIGHT_ACTION
      || item.kind === INGAME_CARD_MENU_ITEM_KINDS.NIGHT_ACTION_CANCEL,
  )

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="플레이어 행동"
      className={INGAME_PLAYER_CARD_OVERLAY_WRAP_CLASS}
      onClick={(event) => event.stopPropagation()}
      {...{ [INGAME_PLAYER_CARD_MENU_ATTR]: "true" }}
    >
      <div className={INGAME_PLAYER_CARD_OVERLAY_SCRIM_CLASS} aria-hidden="true" />
      <div className={INGAME_PLAYER_CARD_OVERLAY_ACTIONS_CLASS}>
        {visibleItems.map((item) => (
          <OverlayImageButton
            key={item.kind}
            label={item.label}
            assetSrc={resolveOverlayButtonAsset(item.kind)}
            disabled={!item.enabled}
            disabledReason={item.disabledReason}
            onClick={() => item.onSelect?.()}
          />
        ))}
        {hasSingleCardAction ? null : (
          <OverlayImageButton
            label="취소"
            assetSrc={INGAME_PLAYER_CARD_OVERLAY_ASSETS.cancelButton}
            onClick={() => onClose?.()}
          />
        )}
      </div>
    </div>
  )
}
