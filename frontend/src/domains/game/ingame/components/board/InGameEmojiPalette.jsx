// 파일 역할: InGameEmojiPalette.jsx - 화면을 구성하는 컴포넌트입니다.
import { useEffect, useRef } from "react"

import PublicAsset from "@/shared/ui/PublicAsset"

import { useInGameEmojiSend } from "../../hooks/useInGameEmojiSend.js"
import { findInGameEmoticonItem } from "../../utils/findInGameEmoticonItem.js"

/** 8칸 방사형 팔레트 배경 — 마이페이지 팔레트 화면과 **같은** 자산이다(복제·이동 없음). */
export const INGAME_EMOJI_PALETTE_FRAME_SRC = "/frame/emoji/palette-frame.png"

/** 이 팔레트 전체를 가리키는 표식. 시험·e2e가 "팔레트가 떴는가"를 DOM 하나로 판정한다. */
export const INGAME_EMOJI_PALETTE_ATTR = "data-ingame-emoji-palette"

export const INGAME_EMOJI_PALETTE_LABEL = "이모티콘 팔레트"

/** 칸의 개수는 서버 계약(EMOJI_PALETTE_SLOT_COUNT=8)과 같다 — 화면이 이 길이를 전제로 그린다. */
export const INGAME_EMOJI_PALETTE_SLOT_COUNT = 8

// 8칸 방사형 배치의 칸 중심 좌표(%). palette-frame.png(769×738)를 12시부터 시계 방향으로 돈다
// (EmoticonPalettePage.jsx의 SLOT_POSITIONS와 같은 값 — 같은 자산의 같은 배치다).
const SLOT_POSITIONS = [
  { top: "12%", left: "50%" },
  { top: "23%", left: "77%" },
  { top: "50%", left: "88%" },
  { top: "77%", left: "77%" },
  { top: "88%", left: "50%" },
  { top: "77%", left: "23%" },
  { top: "50%", left: "12%" },
  { top: "23%", left: "23%" },
]

const PALETTE_WRAP_CLASS =
  "absolute left-1/2 top-1/2 z-40 w-[min(13rem,72vw)] -translate-x-1/2 -translate-y-1/2"

const PALETTE_FRAME_IMAGE_CLASS =
  "pointer-events-none absolute inset-0 z-[1] block h-full w-full select-none object-fill"

const SLOT_BUTTON_CLASS =
  "absolute z-10 flex h-[22%] w-[22%] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-transparent bg-black/30 p-[2%]"

const SLOT_FILLED_CLASS = "cursor-pointer hover:border-[#e8c878] hover:bg-black/50"

const SLOT_EMPTY_CLASS = "cursor-default opacity-40"

/**
 * 본인 카드 우클릭으로 여는 인게임 이모티콘 팔레트(8칸).
 *
 * ── 조상 wrapper로 클릭이 새지 않게 한다 ────────────────────────────────────
 * 이 팔레트는 카드 slot wrapper **안에** 마운트된다. 그 wrapper에는 좌클릭 카드 메뉴를 여는
 * onClick이 달려 있어서, 칸을 그냥 누르면 이모티콘을 보내는 동시에 카드 메뉴가 열린다. 그래서
 * 루트와 각 칸이 모두 전파를 끊는다(InGamePlayerCardMenu.jsx:46의 방어 패턴을 그대로 미러링).
 *
 * ── 한 제스처당 onSelect는 정확히 한 번이다 ─────────────────────────────────
 * 우클릭 누름은 contextmenu로 팔레트를 열고, 그 상태에서 칸 위로 끌어 **놓는** 동작은 click을
 * 만들지 않고 mouseup(button=2)만 만든다(A-07). 그래서 두 경로를 모두 듣되 버튼으로 나눈다 —
 * onMouseUp은 button===2만, onClick은 button===0만 받는다. 둘은 서로 배타적이라 브라우저가
 * 우클릭 뒤 click을 함께 만들더라도 onSelect가 두 번 불리지 않는다(A-07의 반증 조건에 대한
 * 선제 방어 — 한 번 더 보내는 것은 사용자가 의도하지 않은 전송이다).
 *
 * 빈 칸은 무반응이다(전송할 것이 없다 — 서버도 NOT_IN_PALETTE로 거부한다).
 *
 * ── 전송은 이 컴포넌트가 소유한다 ────────────────────────────────────────────
 * 팔레트가 곧 입력 표면이므로 useInGameEmojiSend를 여기서 직접 부른다. 부모(보드)에게는
 * "한 칸이 선택됐다"만 알려 팔레트를 닫게 하고, 연결·소유권·늦은 ACK 판정은 전부 그 훅이
 * 소유한다(send는 언제나 해결된 결과를 돌려주므로 처리되지 않은 rejection이 없다).
 *
 * @param {{slots?: (string|null)[], onSelect?: (itemId: string) => void, onClose?: () => void}} props
 */
export default function InGameEmojiPalette({ slots = [], onSelect, onClose }) {
  const { send } = useInGameEmojiSend()
  const rootRef = useRef(null)
  // 닫기 핸들러는 렌더마다 새 함수일 수 있다 — 거울에 담아 두어 아래 effect가 리스너를
  // 다시 붙이지 않게 한다(리스너를 매 렌더 재등록하면 그 사이 도착한 입력을 놓칠 수 있다).
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  // 바깥 누름·Esc로 닫는다(좌클릭 카드 메뉴와 같은 관례 — useInGamePlayerCardMenu 참고).
  useEffect(() => {
    const close = () => {
      if (typeof onCloseRef.current === "function") onCloseRef.current()
    }
    const handleMouseDown = (event) => {
      const node = rootRef.current
      if (node && node.contains(event.target)) return
      close()
    }
    const handleKeyDown = (event) => {
      if (event.key !== "Escape") return
      close()
    }
    document.addEventListener("mousedown", handleMouseDown)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("mousedown", handleMouseDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [])

  const dispatch = (event, itemId) => {
    // 카드 slot wrapper의 onClick(좌클릭 메뉴 열기)까지 올라가지 않게 먼저 끊는다.
    event.stopPropagation()
    event.preventDefault()
    // 닫기를 **먼저** 알린다 — ACK를 기다리는 동안 팔레트가 떠 있으면 두 번째 입력이 들어와
    // 서버의 1초 간격 제한(RATE_LIMITED)에 사용자가 이유 없이 걸린다.
    if (typeof onSelect === "function") onSelect(itemId)
    // send는 연결 없음·동기 throw·ACK 거부를 모두 흡수해 해결된 결과를 돌려준다. 방어적으로
    // 한 겹 더 감싸 이 경로에서 처리되지 않은 rejection이 생길 수 없게 한다.
    Promise.resolve(send(itemId)).catch(() => {})
  }

  return (
    <div
      ref={rootRef}
      role="group"
      aria-label={INGAME_EMOJI_PALETTE_LABEL}
      className={PALETTE_WRAP_CLASS}
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
      {...{ [INGAME_EMOJI_PALETTE_ATTR]: "true" }}
    >
      <PublicAsset
        src={INGAME_EMOJI_PALETTE_FRAME_SRC}
        alt=""
        className={PALETTE_FRAME_IMAGE_CLASS}
        aria-hidden="true"
      />
      {/* 길이는 항상 8이다 — 서버가 짧은 배열을 보내도 빈 칸으로 채워 그린다. */}
      {Array.from({ length: INGAME_EMOJI_PALETTE_SLOT_COUNT }, (_, index) => {
        const item = findInGameEmoticonItem(slots[index])
        const position = SLOT_POSITIONS[index]
        return (
          <button
            key={`ingame-emoji-slot-${index}`}
            type="button"
            aria-label={item ? `${item.name} 보내기` : `${index + 1}번 칸 비어 있음`}
            disabled={!item}
            style={{ top: position.top, left: position.left }}
            className={`${SLOT_BUTTON_CLASS} ${item ? SLOT_FILLED_CLASS : SLOT_EMPTY_CLASS}`}
            onMouseUp={(event) => {
              if (event.button !== 2) return
              if (!item) return
              dispatch(event, item.id)
            }}
            onClick={(event) => {
              // 전파는 버튼 종류와 무관하게 끊는다 — 보내지 않기로 한 클릭도 카드 메뉴를
              // 열어서는 안 된다(팔레트를 띄운 채 카드가 열리면 두 UI가 겹친다).
              event.stopPropagation()
              if (event.button !== 0) return
              if (!item) return
              dispatch(event, item.id)
            }}
          >
            {item
              ? <PublicAsset src={item.icon} alt={item.name} className="max-h-full max-w-full select-none" />
              : null}
          </button>
        )
      })}
    </div>
  )
}
