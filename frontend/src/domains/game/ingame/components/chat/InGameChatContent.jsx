// 채팅 내용 틀: 틀 그림·메시지 목록·입력칸·보내기·상태 줄을 한 판에 배치
// 채팅 틀·크게 보기 창·재판 연출 채팅이 사용, 모양 차이는 variant로 나눔
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
import { INGAME_TIMER_PLACEMENT } from "../../constants/timebar/ingameTimerPlacement.js"
import InGamePhaseTurnTimerPanel from "../timebar/InGamePhaseTurnTimerPanel.jsx"
import PublicAsset from "@/shared/ui/PublicAsset"

// 틀 바탕·틀 그림 모양 (보드 모양만 눌러서 크게 보기라 손가락 커서)
const CHAT_ROOT_CLASS =
  "group relative w-full [container-type:inline-size]"

const CHAT_ROOT_BOARD_CLASS =
  `${CHAT_ROOT_CLASS} cursor-pointer`

const CHAT_FRAME_IMAGE_CLASS =
  "pointer-events-none absolute inset-0 h-full w-full select-none object-fill transition-[filter,transform] duration-200 ease-out group-hover:scale-[1.004] group-hover:brightness-[1.04]"

// 채팅 한 판 그리기, variant는 컨텍스트로 아래 부품에 내려 줌 (틀 안 타이머는 채팅 틀만 켬)
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
  showEmbeddedPhaseTimer = false,
  embeddedPhaseTimerRemainingRatio = 0,
  embeddedPhaseTimerRemainingSec = null,
}) {
  const [layoutReady, setLayoutReady] = useState(false)

  // 입력칸 너비, 메시지 줄 최대 너비 기준으로 씀
  const [textFieldWidth, setTextFieldWidth] = useState(0)
  const inputWrapRef = useRef(null)
  const isBoard = variant === "board"

  // 첫 프레임 뒤에 보이게 해서 자리 잡기 전 깜빡임 막기
  useEffect(() => {
    const frame = requestAnimationFrame(() => setLayoutReady(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  // 입력칸 너비 재기, 틀·창 크기 바뀔 때마다 다시 잼
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

  // 보드 모양에서 빈 곳 누르면 크게 보기, 목록·입력 줄 누름은 제외
  const handleRootClick = (event) => {
    if (!isBoard || !onOpenCloseup) return
    if (event.target.closest("[data-chat-interactive]")) return
    onOpenCloseup()
  }

  // 보내기 (Enter·버튼 같이 씀)
  const handleSend = () => {
    onSend()
  }

  // 글자 수 자르기는 truncateDraftOnInput일 때만 (지금 부르는 쪽은 전부 끔)
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

        {showEmbeddedPhaseTimer ? (
          <InGamePhaseTurnTimerPanel
            placement={INGAME_TIMER_PLACEMENT.CHAT}
            remainingRatio={embeddedPhaseTimerRemainingRatio}
            remainingSec={embeddedPhaseTimerRemainingSec}
          />
        ) : null}

        <div
          className={MSG_LIST_CONTAINER_CLASS}
          style={getMsgListInset(variant, {
            withEmbeddedPhaseTimer: isBoard && showEmbeddedPhaseTimer,
          })}
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
