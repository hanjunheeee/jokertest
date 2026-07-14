import { useEffect, useLayoutEffect, useRef, useState } from "react"
import {
  INGAME_CHAT_ASSETS,
  INGAME_CHAT_FRAME_ASPECT,
  INGAME_CHAT_INPUT_MAX_LENGTH,
} from "../../constants/chat/ingameChatAssets.js"
import {
  getInGameChatInputShiftClass,
  getInGameChatMessageListInset,
  getInGameChatSendButtonShiftClass,
  getInGameChatTextFieldInset,
  INGAME_CHAT_MESSAGE_LIST_CONTAINER_CLASS,
  INGAME_CHAT_TEXT_FIELD_ROW_CLASS,
} from "../../constants/chat/ingameChatLayout.js"
import InGameChatInput from "./InGameChatInput.jsx"
import InGameChatMessageList from "./InGameChatMessageList.jsx"
import InGameChatSendButton from "./InGameChatSendButton.jsx"
import { InGameChatVariantContext } from "./InGameChatVariantContext.jsx"
import PublicAsset from "@/shared/ui/PublicAsset"

const CHAT_ROOT_CLASS =
  "group relative w-full [container-type:inline-size]"

const CHAT_ROOT_BOARD_CLASS =
  `${CHAT_ROOT_CLASS} cursor-pointer`

const CHAT_FRAME_IMAGE_CLASS =
  "pointer-events-none absolute inset-0 h-full w-full select-none object-fill transition-[filter,transform] duration-200 ease-out group-hover:scale-[1.004] group-hover:brightness-[1.04]"

/**
 * 인게임 채팅 UI — 보드·클로즈업 공통.
 * variant는 Context로 하위(Input·SendButton·MessageRow)에 전달합니다.
 * @param {"board" | "closeup"} [variant]
 * @param {(() => void) | null} [onOpenCloseup] board — 빈 프레임 클릭 시 클로즈업
 */
export default function InGameChatContent({
  variant = "board",
  draft,
  messages,
  onDraftChange,
  onSend,
  onOpenCloseup = null,
}) {
  // 프레임 크기 계산이 끝나서 채팅 UI를 보여줘도 되는지 표시합니다.
  const [layoutReady, setLayoutReady] = useState(false)

  // 메시지 줄맞춤 계산에 쓰는 실제 입력칸 너비입니다.
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
    /** board | closeup — 하위 채팅 컴포넌트들이 현재 표시 모드를 알 수 있게 넘깁니다. */
    <InGameChatVariantContext.Provider value={variant}>
      <div
        className={isBoard ? CHAT_ROOT_BOARD_CLASS : CHAT_ROOT_CLASS}
        style={{
          aspectRatio: INGAME_CHAT_FRAME_ASPECT,
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
          className={INGAME_CHAT_MESSAGE_LIST_CONTAINER_CLASS}
          style={getInGameChatMessageListInset(variant)}
          data-chat-interactive
        >
          <InGameChatMessageList
            messages={messages}
            textFieldWidth={textFieldWidth}
          />
        </div>

        <div
          className={INGAME_CHAT_TEXT_FIELD_ROW_CLASS}
          style={getInGameChatTextFieldInset(variant)}
          data-chat-interactive
        >
          <InGameChatInput
            ref={inputWrapRef}
            value={draft}
            onChange={(event) =>
              onDraftChange(
                event.target.value.slice(0, INGAME_CHAT_INPUT_MAX_LENGTH),
              )
            }
            onSend={handleSend}
            className={getInGameChatInputShiftClass(variant)}
          />
          <InGameChatSendButton
            onSend={handleSend}
            className={getInGameChatSendButtonShiftClass(variant)}
          />
        </div>
      </div>
    </InGameChatVariantContext.Provider>
  )
}
