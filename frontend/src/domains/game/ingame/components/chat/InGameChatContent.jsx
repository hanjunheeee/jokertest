import { useEffect, useState } from "react"
import {
  INGAME_CHAT_ASSETS,
  INGAME_CHAT_FRAME_ASPECT,
  INGAME_CHAT_FRAME_SCALE,
  INGAME_CHAT_MAX_MESSAGE_LENGTH,
} from "../../constants/ingameChatAssets.js"
import {
  INGAME_CHAT_LAYOUT_WIDTH_PERCENT,
  INGAME_CHAT_CLOSE_BUTTON_INSET,
  INGAME_CHAT_MESSAGE_LIST_INSET,
  INGAME_CHAT_SEND_BUTTON_INSET,
  INGAME_CHAT_TEXT_FIELD_INSET,
} from "../../constants/ingameChatLayout.js"
import { pickRandomInGameChatProfile } from "../../utils/pickInGameChatProfile.js"
import InGameChatCloseButton from "./InGameChatCloseButton.jsx"
import InGameChatInput from "./InGameChatInput.jsx"
import InGameChatMessageList from "./InGameChatMessageList.jsx"
import InGameChatSendButton from "./InGameChatSendButton.jsx"
import PublicAsset from "@/shared/ui/PublicAsset"

const CHAT_FRAME_IMAGE_CLASS =
  "pointer-events-none absolute inset-0 h-full w-full origin-bottom-left select-none object-fill"

/** 채팅창 프레임 + 메시지·입력 본문 (셸 내부) */
export default function InGameChatContent({ onClose }) {
  const [draft, setDraft] = useState("")
  const [messages, setMessages] = useState([])
  const [layoutReady, setLayoutReady] = useState(false)

  useEffect(() => {
    const frame = requestAnimationFrame(() => setLayoutReady(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  const handleSend = () => {
    const text = draft.trim()
    if (!text) return

    setMessages((prev) => [
      ...prev,
      {
        id: `local-${Date.now()}`,
        senderName: "You",
        text,
        profileSrc: pickRandomInGameChatProfile(),
      },
    ])
    setDraft("")
  }

  return (
    <div
      className="relative origin-bottom-left [container-type:inline-size]"
      style={{
        width: INGAME_CHAT_LAYOUT_WIDTH_PERCENT,
        aspectRatio: INGAME_CHAT_FRAME_ASPECT,
        opacity: layoutReady ? 1 : 0,
        transition: "opacity 0.15s ease-out",
      }}
      onClick={(event) => event.stopPropagation()}
    >
      <PublicAsset
        src={INGAME_CHAT_ASSETS.frame}
        alt=""
        className={CHAT_FRAME_IMAGE_CLASS}
        style={{
          transform: `scale(${INGAME_CHAT_FRAME_SCALE})`,
          transformOrigin: "bottom left",
        }}
      />

      {onClose ? (
        <div
          className="absolute z-10 flex items-start justify-end"
          style={INGAME_CHAT_CLOSE_BUTTON_INSET}
        >
          <InGameChatCloseButton onClose={onClose} />
        </div>
      ) : null}

      <div
        className="absolute flex min-h-0 flex-col overflow-hidden"
        style={INGAME_CHAT_MESSAGE_LIST_INSET}
      >
        <InGameChatMessageList messages={messages} />
      </div>

      <div
        className="absolute flex items-center"
        style={INGAME_CHAT_TEXT_FIELD_INSET}
      >
        <InGameChatInput
          value={draft}
          onChange={(event) =>
            setDraft(
              event.target.value.slice(0, INGAME_CHAT_MAX_MESSAGE_LENGTH),
            )
          }
          onSend={handleSend}
          className="w-full"
        />
      </div>

      <div
        className="absolute flex items-end justify-end"
        style={INGAME_CHAT_SEND_BUTTON_INSET}
      >
        <InGameChatSendButton
          onSend={handleSend}
          className="-translate-x-[clamp(0.1rem,0.55cqi,0.22rem)]"
        />
      </div>
    </div>
  )
}
