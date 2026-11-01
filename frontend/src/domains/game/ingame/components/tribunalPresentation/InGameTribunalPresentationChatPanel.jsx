import InGameChatContent from "../chat/InGameChatContent.jsx"
import {
  CHAT_PANEL_CLASS,
  getChatPanelStyle,
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
      className={CHAT_PANEL_CLASS}
      style={getChatPanelStyle()}
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
