import { useEffect, useLayoutEffect, useRef, useState } from "react"
import {
  INGAME_CHAT_ASSETS,
  INGAME_CHAT_FRAME_ASPECT,
  INGAME_CHAT_INPUT_MAX_LENGTH,
} from "../../constants/ingameChatAssets.js"
import {
  INGAME_CHAT_INPUT_SHIFT_CLASS,
  INGAME_CHAT_MESSAGE_LIST_CONTAINER_CLASS,
  INGAME_CHAT_MESSAGE_LIST_INSET,
  INGAME_CHAT_TEXT_FIELD_INSET,
  INGAME_CHAT_TEXT_FIELD_ROW_CLASS,
} from "../../constants/ingameChatLayout.js"
import InGameChatInput from "./InGameChatInput.jsx"
import InGameChatMessageList from "./InGameChatMessageList.jsx"
import InGameChatSendButton from "./InGameChatSendButton.jsx"
import PublicAsset from "@/shared/ui/PublicAsset"

const CHAT_ROOT_CLASS =
  "group relative w-full cursor-pointer [container-type:inline-size]"

const CHAT_FRAME_IMAGE_CLASS =
  "pointer-events-none absolute inset-0 h-full w-full select-none object-fill transition-[filter,transform] duration-200 ease-out group-hover:scale-[1.004] group-hover:brightness-[1.04]"

/** 채팅창 프레임 + 메시지·입력 본문 (셸 내부) */
export default function InGameChatContent() {
  const [draft, setDraft] = useState("")
  const [messages, setMessages] = useState([])
  const [layoutReady, setLayoutReady] = useState(false)
  const [textFieldWidth, setTextFieldWidth] = useState(0)
  const inputWrapRef = useRef(null)

  useEffect(() => {
    const frame = requestAnimationFrame(() => setLayoutReady(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  useLayoutEffect(() => {
    const inputWrap = inputWrapRef.current
    if (!inputWrap) return undefined

    const syncWidth = () => {
      const textarea = inputWrap.querySelector("textarea")
      if (!textarea) return
      setTextFieldWidth(textarea.clientWidth)
    }

    syncWidth()
    const observer = new ResizeObserver(syncWidth)
    observer.observe(inputWrap)
    window.addEventListener("resize", syncWidth)

    return () => {
      observer.disconnect()
      window.removeEventListener("resize", syncWidth)
    }
  }, [layoutReady])

  const handleSend = () => {
    const text = draft.trim().slice(0, INGAME_CHAT_INPUT_MAX_LENGTH)
    if (!text) return

    setMessages((prev) => [
      ...prev,
      {
        id: `local-${Date.now()}`,
        senderName: "You",
        text,
      },
    ])
    setDraft("")
  }

  return (
    <div
      className={CHAT_ROOT_CLASS}
      style={{
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
      />

      <div
        className={INGAME_CHAT_MESSAGE_LIST_CONTAINER_CLASS}
        style={INGAME_CHAT_MESSAGE_LIST_INSET}
      >
        <InGameChatMessageList
          messages={messages}
          textFieldWidth={textFieldWidth}
        />
      </div>

      <div
        className={INGAME_CHAT_TEXT_FIELD_ROW_CLASS}
        style={INGAME_CHAT_TEXT_FIELD_INSET}
      >
        <InGameChatInput
          ref={inputWrapRef}
          value={draft}
          onChange={(event) =>
            setDraft(
              event.target.value.slice(0, INGAME_CHAT_INPUT_MAX_LENGTH),
            )
          }
          onSend={handleSend}
          className={INGAME_CHAT_INPUT_SHIFT_CLASS}
        />
        <InGameChatSendButton
          onSend={handleSend}
          className="-translate-x-[clamp(1.5rem,8cqi,2.4rem)]"
        />
      </div>
    </div>
  )
}
