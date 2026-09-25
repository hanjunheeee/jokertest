// 파일 역할: InGameEmojiBubble.jsx - 화면을 구성하는 컴포넌트입니다.
import PublicAsset from "@/shared/ui/PublicAsset"

import { findInGameEmoticonItem } from "../../utils/findInGameEmoticonItem.js"

/** 말풍선 배경 — 실제로 존재하는 이모티콘 자산을 그대로 쓴다(복제·이동 없음). */
export const INGAME_EMOJI_BUBBLE_SRC = "/frame/emoji/speech-bubble.png"

/** 이 말풍선을 가리키는 표식. 시험·e2e가 "말풍선이 떴는가"를 DOM 하나로 판정한다. */
export const INGAME_EMOJI_BUBBLE_ATTR = "data-ingame-emoji-bubble"

const BUBBLE_WRAP_CLASS =
  "pointer-events-none absolute bottom-full left-1/2 z-30 w-[min(4.5rem,42%)] -translate-x-1/2 -translate-y-1"

const BUBBLE_FRAME_IMAGE_CLASS = "block h-auto w-full select-none"

const BUBBLE_ICON_WRAP_CLASS = "absolute inset-0 flex items-center justify-center p-[22%] pb-[32%]"

/**
 * 인게임 이모티콘 말풍선 — 카드 위에 떠서 그 참가자가 방금 보낸 이모티콘 하나를 보여 준다.
 *
 * **타이머를 갖지 않는다.** 3초 만료는 inGameEmojiBubble.store가 소유하고, 이 컴포넌트는
 * 그 store에 항목이 있는 동안만 부모(InGamePlayerBoard)에 의해 마운트된다 — 그래서 같은
 * uuid의 재수신이 컴포넌트 교체로 처리돼도 남은 시간이 화면마다 갈리지 않는다.
 *
 * 카탈로그에 없는 itemId(구버전 데이터·다른 카테고리)는 아무것도 그리지 않는다(null) —
 * 서버가 보낸 문자열을 그대로 화면에 노출하지 않는다.
 */
export default function InGameEmojiBubble({ itemId }) {
  const item = findInGameEmoticonItem(itemId)
  if (!item) return null

  return (
    <div className={BUBBLE_WRAP_CLASS} {...{ [INGAME_EMOJI_BUBBLE_ATTR]: item.id }}>
      <PublicAsset src={INGAME_EMOJI_BUBBLE_SRC} alt="" className={BUBBLE_FRAME_IMAGE_CLASS} aria-hidden="true" />
      <span className={BUBBLE_ICON_WRAP_CLASS}>
        <PublicAsset src={item.icon} alt={item.name} className="max-h-full max-w-full select-none" />
      </span>
    </div>
  )
}
