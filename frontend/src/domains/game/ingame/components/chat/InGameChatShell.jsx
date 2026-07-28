import { useState } from "react"
import {
  INGAME_CHAT_PANEL_POSITION_CLASS,
  getInGameChatPanelStyle,
} from "../../constants/chat/ingameChatBoardLayout.js"
import { useInGameChatSession } from "../../hooks/useInGameChatSession.js"
import { useInGameJokerChatSession } from "../../hooks/useInGameJokerChatSession.js"
import { useInGamePlayerSessionContext } from "../InGamePlayerSessionContext.js"
import { useInGameStore } from "../../store/ingameStore.js"
import { isJokerNightChatEligible } from "../../utils/isJokerNightChatEligible.js"
import InGameChatCloseupOverlay from "./closeup/InGameChatCloseupOverlay.jsx"
import InGameChatContent from "./InGameChatContent.jsx"
import { getSocket } from "@/shared/socket/socketClient"

/**
 * 인게임 채팅 — 탁자 중앙 상시 표시 + 클로즈업 오버레이
 */
export default function InGameChatShell() {
  // 채팅창을 크게 보는 오버레이가 열려 있는지 표시합니다.
  const [closeupOpen, setCloseupOpen] = useState(false)
  const { localPlayerId, getPlayerById } = useInGamePlayerSessionContext()
  const gameState = useInGameStore((s) => s.state)
  const isJokerNight = isJokerNightChatEligible(gameState)

  // React Hooks 규칙상 두 훅 모두 항상 호출한다 — 결과만 조건부로 선택한다.
  const publicChatSession = useInGameChatSession({
    localPlayerId,
    getPlayerById,
    serverEvents: gameState?.events ?? null,
    onSendText: gameState
      ? (text) => {
          getSocket()?.emit("send_game_chat", { channel: "PUBLIC", text })
        }
      : null,
  })
  const jokerChatSession = useInGameJokerChatSession({ getPlayerById })

  const chatSession = isJokerNight ? jokerChatSession : publicChatSession

  const chatProps = {
    draft: chatSession.draft,
    messages: chatSession.messages,
    onDraftChange: chatSession.setDraft,
    onSend: chatSession.send,
    status: chatSession.status ?? null,
    error: chatSession.error ?? null,
    truncateDraftOnInput: !isJokerNight,
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
