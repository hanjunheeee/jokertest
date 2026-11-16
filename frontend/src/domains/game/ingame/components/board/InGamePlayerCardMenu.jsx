// 플레이어 카드 메뉴: 카드 위에 뜨는 투표·밤 행동·재판 버튼 묶음
// 플레이어 보드(InGamePlayerBoard)가 사용, 항목은 useInGamePlayerCardMenu가 만듦
import { useId } from "react"
import PublicAsset from "@/shared/ui/PublicAsset"
import { PLAYER_CARD_OVERLAY_ASSETS } from "../../constants/board/ingamePlayerCardOverlayAssets.js"
import {
  OVERLAY_ACTIONS_CLASS,
  OVERLAY_BTN_CLASS,
  OVERLAY_BTN_IMG_CLASS,
  OVERLAY_BTN_LABEL_CLASS,
  OVERLAY_REASON_CLASS,
  OVERLAY_SCRIM_CLASS,
  OVERLAY_WRAP_CLASS,
} from "../../constants/board/ingamePlayerCardOverlayLayout.js"
import { INGAME_CARD_MENU_ITEM_KINDS } from "../../hooks/useInGamePlayerCardMenu.js"

// 키보드로 왔을 때만 보이는 초점 테두리
const FOCUS_RING_CLASS = "outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f3d28d]"

// 시험이 메뉴를 찾는 표시
export const INGAME_PLAYER_CARD_MENU_ATTR = "data-ingame-player-card-menu"

// 취소류·유죄는 취소 그림, 나머지는 확인 그림
function resolveOverlayButtonAsset(kind) {
  if (
    kind === INGAME_CARD_MENU_ITEM_KINDS.DAY_VOTE_CANCEL
    || kind === INGAME_CARD_MENU_ITEM_KINDS.NIGHT_ACTION_CANCEL
    || kind === INGAME_CARD_MENU_ITEM_KINDS.TRIBUNAL_GUILTY
  ) {
    return PLAYER_CARD_OVERLAY_ASSETS.cancelButton
  }
  return PLAYER_CARD_OVERLAY_ASSETS.confirmButton
}

// 그림 버튼 하나, 못 누를 땐 이유를 버튼 아래 보이는 글 한 줄로 (모바일 시트와 같음, 꺼진 버튼은 흐려서 글을 버튼 밖에 둠)
// 화면 읽기엔 버튼 설명(숨김 글자)으로 한 번만 읽히게 보이는 줄은 읽기에서 뺌, title은 마우스 올림용 그대로
// readingName: 화면 읽기용 이름 (안 주면 보이는 글과 같음)
function OverlayImageButton({ label, readingName = label, assetSrc, disabled = false, disabledReason = null, onClick }) {
  const reasonId = useId()
  const showReason = disabled && Boolean(disabledReason)
  return (
    <>
    <button
      type="button"
      role="menuitem"
      aria-label={readingName}
      aria-describedby={showReason ? reasonId : undefined}
      title={showReason ? disabledReason : undefined}
      className={`${OVERLAY_BTN_CLASS} ${FOCUS_RING_CLASS}`}
      disabled={disabled}
      onClick={onClick}
    >
      <PublicAsset src={assetSrc} alt="" className={OVERLAY_BTN_IMG_CLASS} />
      <span className={OVERLAY_BTN_LABEL_CLASS}>{label}</span>
      {showReason ? <span id={reasonId} className="sr-only">{disabledReason}</span> : null}
    </button>
    {showReason ? (
      <p aria-hidden="true" className={OVERLAY_REASON_CLASS} data-ingame-card-menu-reason="">{disabledReason}</p>
    ) : null}
    </>
  )
}

// 밤 행동 버튼의 읽기 이름: 대상 이름을 앞에 붙임 (화면 읽기 프로그램이 누구에게 하는지 알게, 보이는 글은 그대로)
// 예: ("민수", "암살") → "민수 암살", ("민수 · 동료 의사", "보호") → "민수 · 동료 의사 보호"
function nightReadingName(targetName, label) {
  return targetName ? `${targetName} ${label}` : label
}

// 보이는 항목만 버튼으로, 바깥 누름·Esc 닫기는 카드 메뉴 훅이 맡음
// targetName: 이 카드 사람 이름 (동료면 "민수 · 동료 의사")
export default function InGamePlayerCardMenu({ items = [], targetName = "", onClose, menuRef }) {
  const visibleItems = items.filter((item) => item.visible !== false)
  // 낮 투표·밤 행동 항목이 있으면 따로 취소 버튼 안 붙임
  const hasSingleCardAction = visibleItems.some(
    (item) => item.kind === INGAME_CARD_MENU_ITEM_KINDS.DAY_VOTE
      || item.kind === INGAME_CARD_MENU_ITEM_KINDS.DAY_VOTE_CANCEL
      || item.kind === INGAME_CARD_MENU_ITEM_KINDS.NIGHT_ACTION
      || item.kind === INGAME_CARD_MENU_ITEM_KINDS.NIGHT_ACTION_CANCEL,
  )

  // 메뉴 안 누름이 카드 누름(메뉴 다시 열기)으로 번지지 않게 막음
  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="플레이어 행동"
      className={OVERLAY_WRAP_CLASS}
      onClick={(event) => event.stopPropagation()}
      {...{ [INGAME_PLAYER_CARD_MENU_ATTR]: "true" }}
    >
      <div className={OVERLAY_SCRIM_CLASS} aria-hidden="true" />
      <div className={OVERLAY_ACTIONS_CLASS}>
        {visibleItems.map((item) => (
          <OverlayImageButton
            key={item.kind}
            label={item.label}
            readingName={
              item.kind === INGAME_CARD_MENU_ITEM_KINDS.NIGHT_ACTION ? nightReadingName(targetName, item.label) : item.label
            }
            assetSrc={resolveOverlayButtonAsset(item.kind)}
            disabled={!item.enabled}
            disabledReason={item.disabledReason}
            onClick={() => item.onSelect?.()}
          />
        ))}
        {hasSingleCardAction ? null : (
          <OverlayImageButton
            label="취소"
            assetSrc={PLAYER_CARD_OVERLAY_ASSETS.cancelButton}
            onClick={() => onClose?.()}
          />
        )}
      </div>
    </div>
  )
}
