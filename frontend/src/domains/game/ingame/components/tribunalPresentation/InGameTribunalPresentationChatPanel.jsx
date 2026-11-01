// 재판 연출 채팅 칸: 재판 연출 오른쪽 '최후의 반론' 채팅
// 재판 연출 창(InGameTribunalPresentationOverlay)이 사용
import InGameChatContent from "../chat/InGameChatContent.jsx"
import {
  CHAT_PANEL_CLASS,
  getChatPanelStyle,
} from "../../constants/tribunalPresentation/ingameTribunalPresentationLayout.js"

// 채팅 값은 그대로 tribunal 모양 채팅 내용에 넘김, 글자 수 자르기는 기본으로 끔
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
