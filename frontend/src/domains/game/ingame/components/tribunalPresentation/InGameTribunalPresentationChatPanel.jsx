import InGameChatContent from "../chat/InGameChatContent.jsx"
import {
  INGAME_TRIBUNAL_PRESENTATION_CHAT_PANEL_CLASS,
  getInGameTribunalPresentationChatPanelStyle,
} from "../../constants/tribunalPresentation/ingameTribunalPresentationLayout.js"

export default function InGameTribunalPresentationChatPanel({
  draft,
  messages,
  onDraftChange,
  onSend,
  status = null,
  error = null,
  truncateDraftOnInput = false,
}) {
  return (
    <div
      className={INGAME_TRIBUNAL_PRESENTATION_CHAT_PANEL_CLASS}
      style={getInGameTribunalPresentationChatPanelStyle()}
      aria-label="최후의 반론 채팅"
    >
      <InGameChatContent
        variant="tribunal"
        draft={draft}
        messages={messages}
        onDraftChange={onDraftChange}
        onSend={onSend}
        status={status}
        error={error}
        truncateDraftOnInput={truncateDraftOnInput}
      />
    </div>
  )
}
