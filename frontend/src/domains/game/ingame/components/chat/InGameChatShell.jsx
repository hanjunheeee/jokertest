import { useState } from "react"
import {
  INGAME_CHAT_PANEL_POSITION_CLASS,
  getInGameChatPanelStyle,
} from "../../constants/chat/ingameChatBoardLayout.js"
import { useInGameGameChatSession } from "../../hooks/useInGameGameChatSession.js"
import { useInGameJokerChatSession } from "../../hooks/useInGameJokerChatSession.js"
import { useInGamePlayerSessionContext } from "../InGamePlayerSessionContext.js"
import { useInGameStore } from "../../store/ingameStore.js"
import { isJokerNightChatEligible } from "../../utils/isJokerNightChatEligible.js"
import InGameChatCloseupOverlay from "./closeup/InGameChatCloseupOverlay.jsx"
import InGameChatContent from "./InGameChatContent.jsx"

/**
 * 인게임 채팅 — 탁자 중앙 상시 표시 + 클로즈업 오버레이
 *
 * 어느 채팅을 보여줄지는 canonical 상태에서만 유도한다(사용자가 고르는 채널 선택기는 없다):
 * 생존한 JOKER의 NIGHT이면 JOKER 비밀 채팅, 그 외에는 공개 DAY/사망자 전용 채팅
 * (useInGameGameChatSession이 self.alive로 두 채널을 다시 가른다).
 */
export default function InGameChatShell() {
  // 채팅창을 크게 보는 오버레이가 열려 있는지 표시합니다.
  const [closeupOpen, setCloseupOpen] = useState(false)
  const { getPlayerById } = useInGamePlayerSessionContext()
  const gameState = useInGameStore((s) => s.state)
  const isJokerNight = isJokerNightChatEligible(gameState)

  // React Hooks 규칙상 두 훅 모두 항상 호출한다 — 결과만 조건부로 선택한다.
  const gameChatSession = useInGameGameChatSession({ getPlayerById })
  const jokerChatSession = useInGameJokerChatSession({ getPlayerById })

  const chatSession = isJokerNight ? jokerChatSession : gameChatSession

  const chatProps = {
    draft: chatSession.draft,
    messages: chatSession.messages,
    onDraftChange: chatSession.setDraft,
    onSend: chatSession.send,
    status: chatSession.status ?? null,
    error: chatSession.error ?? null,
    // 두 채팅 모두 서버와 동일한 sanitize 규칙(150자·금지 문자)을 쓰고 초과분은 조용히
    // 잘라내지 않고 오류로 안내한다 — 입력 단계에서 잘라내지 않는다.
    truncateDraftOnInput: false,
  }

  return (
    <>
      <aside
        aria-label="채팅"
        className={INGAME_CHAT_PANEL_POSITION_CLASS}
        style={getInGameChatPanelStyle()}
      >
        <InGameChatContent
          variant="board"
          {...chatProps}
          onOpenCloseup={() => setCloseupOpen(true)}
        />
      </aside>

      <InGameChatCloseupOverlay
        open={closeupOpen}
        onClose={() => setCloseupOpen(false)}
        {...chatProps}
      />
    </>
  )
}
