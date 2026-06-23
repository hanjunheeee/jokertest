import { useEffect, useState } from "react"
import {
  INGAME_CHAT_ASSETS,
  INGAME_CHAT_FRAME_ASPECT,
  INGAME_CHAT_MAX_MESSAGE_LENGTH,
} from "../../constants/ingameChatAssets.js"
import { pickRandomInGameChatProfile } from "../../utils/pickInGameChatProfile.js"
import InGameChatInput from "./InGameChatInput.jsx"
import InGameChatMessageList from "./InGameChatMessageList.jsx"
import PublicAsset from "@/shared/ui/PublicAsset"

/** 채팅창 프레임.png 기준 본문·입력 영역 inset — top 올려 상단 넘침 클립 */
const CHAT_MESSAGE_LIST_INSET = {
  top: "20%",
  bottom: "30%",
  left: "8%",
  right: "8.5%",
}

const CHAT_INPUT_INSET = {
  bottom: "5.5%",
  left: "8%",
  right: "6%",
  height: "15.5%",
}

const CHAT_PANEL_POSITION_CLASS =
  "absolute bottom-[clamp(0.6rem,2.2vh,1.35rem)] left-[clamp(0.45rem,1.4cqw,0.9rem)] z-10 w-[clamp(18.5rem,34cqw,28.5rem)] [container-type:inline-size]"

/**
 * 인게임 좌측 하단 채팅 패널
 */
export default function InGameChatPanel() {
  const [draft, setDraft] = useState("")
  const [messages, setMessages] = useState([])
  const [layoutReady, setLayoutReady] = useState(false)

  // 프레임 PNG 로드 전 높이 0 → % inset 깨짐 방지: aspect-ratio + rAF 후 표시
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
    <div className={CHAT_PANEL_POSITION_CLASS}>
      <div
        className="relative w-full overflow-hidden"
        style={{
          aspectRatio: INGAME_CHAT_FRAME_ASPECT,
          opacity: layoutReady ? 1 : 0,
          transition: "opacity 0.15s ease-out",
        }}
      >
        <PublicAsset
          src={INGAME_CHAT_ASSETS.frame}
          alt=""
          className="absolute inset-0 h-full w-full select-none object-fill"
        />

        <div
          className="absolute flex min-h-0 flex-col overflow-hidden"
          style={CHAT_MESSAGE_LIST_INSET}
        >
          <InGameChatMessageList messages={messages} />
        </div>

        <div
          className="absolute flex flex-col justify-end"
          style={CHAT_INPUT_INSET}
        >
          <InGameChatInput
            value={draft}
            onChange={(event) =>
              setDraft(
                event.target.value.slice(0, INGAME_CHAT_MAX_MESSAGE_LENGTH),
              )
            }
            onSend={handleSend}
          />
        </div>
      </div>
    </div>
  )
}
