// 파일 역할: InGamePlayerCardMenu.jsx - 화면을 구성하는 컴포넌트입니다.
import PublicAsset from "@/shared/ui/PublicAsset"

/** 카드 위에 뜨는 메뉴의 배경 — 실제로 존재하는 인게임 프레임 자산을 그대로 쓴다(복제·이동 없음). */
export const INGAME_PLAYER_CARD_MENU_FRAME_SRC = "/frame/인게임 설정 프레임_.png"

/** 이 메뉴 전체를 가리키는 표식. 시험·e2e가 "메뉴가 떴는가"를 DOM 하나로 판정한다. */
export const INGAME_PLAYER_CARD_MENU_ATTR = "data-ingame-player-card-menu"

const MENU_WRAP_CLASS =
  "absolute left-1/2 top-full z-40 w-[min(11rem,60vw)] -translate-x-1/2 translate-y-1"

const MENU_FRAME_IMAGE_CLASS =
  "pointer-events-none absolute inset-0 z-[1] block h-full w-full select-none object-fill"

const MENU_CONTENT_CLASS =
  "relative z-10 flex flex-col gap-1 px-3 py-3 text-[0.75rem] text-[#f8ead2]"

const MENU_ITEM_CLASS =
  "w-full rounded px-2 py-1 text-left font-semibold transition-colors enabled:hover:bg-[#f3d28d]/20 disabled:cursor-not-allowed disabled:opacity-60"

const MENU_REASON_CLASS = "mt-0.5 block text-[0.65rem] font-normal text-[#e0c9a3]"

const MENU_CLOSE_CLASS =
  "mt-1 w-full rounded border border-[#f3d28d]/40 px-2 py-1 text-[0.65rem] text-[#e0c9a3]"

/**
 * 플레이어 카드 좌클릭 메뉴.
 *
 * 열림·닫힘·항목 계산·제출은 전부 useInGamePlayerCardMenu가 소유한다 — 이 컴포넌트는 받은
 * 항목을 그리고 눌린 항목의 onSelect를 그대로 부르는 일만 한다(여기서 onClose를 함께 부르면
 * 훅이 "제출 뒤 닫기"를 소유하지 못하고 닫힘 순서가 두 곳으로 갈린다).
 *
 * 루트의 onClick stopPropagation은 오인 방지 보조일 뿐이다 — 바깥 클릭 판정 자체는 훅이
 * document mousedown + contains로 한다.
 */
export default function InGamePlayerCardMenu({ items = [], onClose, menuRef }) {
  const visibleItems = items.filter((item) => item.visible !== false)

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="플레이어 행동"
      className={MENU_WRAP_CLASS}
      onClick={(event) => event.stopPropagation()}
      {...{ [INGAME_PLAYER_CARD_MENU_ATTR]: "true" }}
    >
      <PublicAsset
        src={INGAME_PLAYER_CARD_MENU_FRAME_SRC}
        alt=""
        className={MENU_FRAME_IMAGE_CLASS}
        aria-hidden="true"
      />
      <div className={MENU_CONTENT_CLASS}>
        {visibleItems.map((item) => (
          <button
            key={item.kind}
            type="button"
            role="menuitem"
            className={MENU_ITEM_CLASS}
            disabled={!item.enabled}
            onClick={() => item.onSelect?.()}
          >
            {item.label}
            {!item.enabled && item.disabledReason ? (
              <span className={MENU_REASON_CLASS}>{item.disabledReason}</span>
            ) : null}
          </button>
        ))}
        <button type="button" className={MENU_CLOSE_CLASS} onClick={() => onClose?.()}>
          닫기
        </button>
      </div>
    </div>
  )
}
