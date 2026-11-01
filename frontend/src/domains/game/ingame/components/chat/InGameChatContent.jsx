import { useEffect, useLayoutEffect, useRef, useState } from "react"
import {
  INGAME_CHAT_ASSETS,
  FRAME_ASPECT,
  INPUT_MAX_LENGTH,
} from "../../constants/chat/ingameChatAssets.js"
import {
  getInputShiftClass,
  getMsgListInset,
  getSendBtnShiftClass,
  getStatusLineInset,
  getTextFieldInset,
  MSG_LIST_CONTAINER_CLASS,
  STATUS_LINE_WRAP_CLASS,
  TEXT_FIELD_ROW_CLASS,
} from "../../constants/chat/ingameChatLayout.js"
import InGameChatInput from "./InGameChatInput.jsx"
import InGameChatMessageList from "./InGameChatMessageList.jsx"
import InGameChatSendButton from "./InGameChatSendButton.jsx"
import InGameChatStatusLine from "./InGameChatStatusLine.jsx"
import { InGameChatVariantContext } from "./InGameChatVariantContext.jsx"
import PublicAsset from "@/shared/ui/PublicAsset"

const CHAT_ROOT_CLASS =
  "group relative w-full [container-type:inline-size]"

const CHAT_ROOT_BOARD_CLASS =
  `${CHAT_ROOT_CLASS} cursor-pointer`

const CHAT_FRAME_IMAGE_CLASS =
  "pointer-events-none absolute inset-0 h-full w-full select-none object-fill transition-[filter,transform] duration-200 ease-out group-hover:scale-[1.004] group-hover:brightness-[1.04]"

export default function InGameChatContent({
  variant = "board",
  draft,
  messages,
  onDraftChange,
  onSend,
  onOpenCloseup = null,
  status = null,
  error = null,
  truncateDraftOnInput = true,
}) {
  const [layoutReady, setLayoutReady] = useState(false)

  const [textFieldWidth, setTextFieldWidth] = useState(0)
  const inputWrapRef = useRef(null)
  const isBoard = variant === "board"

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

  const handleRootClick = (event) => {
    if (!isBoard || !onOpenCloseup) return
    if (event.target.closest("[data-chat-interactive]")) return
    onOpenCloseup()
  }

  const handleSend = () => {
    onSend()
  }

  return (
    <InGameChatVariantContext.Provider value={variant}>
      <div
        className={isBoard ? CHAT_ROOT_BOARD_CLASS : CHAT_ROOT_CLASS}
        style={{
          aspectRatio: FRAME_ASPECT,
          opacity: layoutReady ? 1 : 0,
          transition: "opacity 0.15s ease-out",
        }}
        onClick={handleRootClick}
      >
        <PublicAsset
          src={INGAME_CHAT_ASSETS.frame}
          alt=""
          className={CHAT_FRAME_IMAGE_CLASS}
        />

        <div
          className={MSG_LIST_CONTAINER_CLASS}
          style={getMsgListInset(variant)}
          data-chat-interactive
        >
          <InGameChatMessageList
            messages={messages}
            textFieldWidth={textFieldWidth}
          />
        </div>

        <div
          className={TEXT_FIELD_ROW_CLASS}
          style={getTextFieldInset(variant)}
          data-chat-interactive
        >
          <InGameChatInput
            ref={inputWrapRef}
            value={draft}
            onChange={(event) =>
              onDraftChange(
                truncateDraftOnInput
                  ? event.target.value.slice(0, INPUT_MAX_LENGTH)
                  : event.target.value,
              )
            }
            onSend={handleSend}
            className={getInputShiftClass(variant)}
            truncateDraftOnInput={truncateDraftOnInput}
          />
          <InGameChatSendButton
            onSend={handleSend}
            className={getSendBtnShiftClass(variant)}
          />
        </div>

        <div
          className={STATUS_LINE_WRAP_CLASS}
          style={getStatusLineInset(variant)}
        >
          <InGameChatStatusLine status={status} error={error} />
        </div>
      </div>
    </InGameChatVariantContext.Provider>
  )
}
