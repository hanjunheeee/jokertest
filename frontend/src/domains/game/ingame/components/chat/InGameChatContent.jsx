// 채팅 내용 틀: 틀 그림·메시지 목록·입력칸·보내기·상태 줄을 한 판에 배치, 밤에 산 시민은 입력칸 대신 까닭 한 줄, 역할 확인 동안은 입력칸 꺼짐
// 채팅 틀·크게 보기 창·재판 연출 채팅이 사용, 모양 차이는 variant로 나눔
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import {
  INGAME_CHAT_ASSETS,
  INGAME_CHAT_USE_UNIFIED_PANEL,
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
import { useInGameStore } from "../../store/ingameStore.js"
import {
  isNightChatInputClosed,
  isRoleRevealChatLocked,
  NIGHT_CHAT_CLOSED_TEXT,
  ROLE_REVEAL_CHAT_LOCKED_TEXT,
} from "../../utils/inGameChatChannel.js"

// 틀 바탕·틀 그림 모양 (보드 모양만 눌러서 크게 보기라 손가락 커서)
const CHAT_ROOT_CLASS =
  "group relative w-full overflow-visible [container-type:inline-size]"

const CHAT_ROOT_BOARD_CLASS =
  `${CHAT_ROOT_CLASS} cursor-pointer`

// 죽은 사람끼리 표시 (채팅 목록 칸 맨 위 가운데, 회색)
const DEAD_CHAT_BADGE_CLASS =
  "absolute left-1/2 top-0 z-10 -translate-x-1/2 whitespace-nowrap rounded-full border border-[#9a9a9a]/60 bg-black/70 px-2 py-0.5 text-[0.62rem] font-semibold tracking-wide text-[#d4d4d4]"

// 밤 시민 입력칸 닫힘 까닭 (어두운 바탕에 밝은 글자, 틀 그림 위에서도 보이게)
const NIGHT_CLOSED_TEXT_CLASS =
  "w-full truncate rounded bg-black/75 px-2 py-1 text-center text-[clamp(0.6rem,2.6cqi,0.85rem)] font-semibold text-[#f2e6cf]"

const CHAT_FRAME_IMAGE_CLASS =
  "pointer-events-none absolute inset-0 h-full w-full select-none object-fill transition-[filter,transform] duration-200 ease-out group-hover:scale-[1.004] group-hover:brightness-[1.04]"

// 입력칸 너비를 재서 메시지 줄 최대 너비에 반영함
function useTextFieldWidth(inputWrapRef, layoutReady, inputClosed) {
  const [textFieldWidth, setTextFieldWidth] = useState(0)

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
  }, [inputWrapRef, layoutReady, inputClosed])

  return textFieldWidth
}

// 하단 입력 줄 그리기 (밤 산 시민은 닫힘 문구, 그 밖엔 입력칸과 보내기 단추)
function ChatTextFieldRow({
  variant,
  useUnifiedFrame,
  inputClosed,
  inputLocked,
  inputWrapRef,
  draft,
  onDraftChange,
  truncateDraftOnInput,
  onSend,
}) {
  return (
    <div
      className={TEXT_FIELD_ROW_CLASS}
      style={getTextFieldInset(variant, { withEmbeddedPhaseTimer: useUnifiedFrame })}
      data-chat-interactive
    >
      {inputClosed ? (
        <p role="status" className={NIGHT_CLOSED_TEXT_CLASS} data-night-chat-closed="">
          {NIGHT_CHAT_CLOSED_TEXT}
        </p>
      ) : (
        <>
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
            onSend={onSend}
            className={getInputShiftClass(variant)}
            truncateDraftOnInput={truncateDraftOnInput}
            disabled={inputLocked}
            disabledHint={ROLE_REVEAL_CHAT_LOCKED_TEXT}
          />
          <InGameChatSendButton
            onSend={onSend}
            className={getSendBtnShiftClass(variant)}
            disabled={inputLocked}
          />
        </>
      )}
    </div>
  )
}

// 채팅 한 판 그리기, 타이머가 없을 때는 빈 명패·시계 상자가 없는 틀을 씀
export default function InGameChatContent({
  variant = "board", draft, messages, onDraftChange, onSend, onOpenCloseup = null,
  status = null, error = null, truncateDraftOnInput = true, isDeadChat = false,
  showEmbeddedPhaseTimer = false, embeddedPhaseTimerStatusLabel = null,
  embeddedPhaseTimerRemainingRatio = 0, embeddedPhaseTimerRemainingSec = null,
  embeddedPhaseTimerShowResourcesWithoutLabel = false,
}) {
  const [layoutReady, setLayoutReady] = useState(false)
  const inputWrapRef = useRef(null)
  const isBoard = variant === "board"
  const inputClosed = useInGameStore((s) => isNightChatInputClosed(s.state))
  const inputLocked = useInGameStore((s) => isRoleRevealChatLocked(s.state))
  const textFieldWidth = useTextFieldWidth(inputWrapRef, layoutReady, inputClosed)
  const useUnifiedFrame = showEmbeddedPhaseTimer && INGAME_CHAT_USE_UNIFIED_PANEL
  const frameSrc = useUnifiedFrame ? INGAME_CHAT_ASSETS.frame : INGAME_CHAT_ASSETS.frameWithoutTimer
  const listInset = getMsgListInset(variant, { withEmbeddedPhaseTimer: showEmbeddedPhaseTimer })
  const timerLayout = variant === "closeup" ? "closeup" : (variant === "tribunal" ? "tribunal" : "board")

  useEffect(() => {
    const frame = requestAnimationFrame(() => setLayoutReady(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  const handleRootClick = (event) => {
    if (isBoard && onOpenCloseup && !event.target.closest("[data-chat-interactive]")) onOpenCloseup()
  }
  const handleSend = () => {
    if (!inputLocked) onSend()
  }

  return (
    <InGameChatVariantContext.Provider value={variant}>
      <div
        className={isBoard ? CHAT_ROOT_BOARD_CLASS : CHAT_ROOT_CLASS}
        style={{ aspectRatio: FRAME_ASPECT, opacity: layoutReady ? 1 : 0, transition: "opacity 0.15s ease-out" }}
        onClick={handleRootClick}
      >
        <PublicAsset src={frameSrc} alt="" className={CHAT_FRAME_IMAGE_CLASS} />
        {isBoard && onOpenCloseup ? (
          <button
            type="button"
            data-chat-interactive
            className="sr-only focus:not-sr-only focus:absolute focus:right-2 focus:top-2 focus:z-20 focus:rounded focus:bg-black/80 focus:px-2 focus:py-1 focus:text-xs focus:text-white"
            onClick={() => onOpenCloseup()}
          >
            채팅 크게 보기
          </button>
        ) : null}
        {showEmbeddedPhaseTimer ? (
          <InGamePhaseTurnTimerPanel
            placement={INGAME_TIMER_PLACEMENT.CHAT}
            embeddedLayout={timerLayout}
            statusLabel={embeddedPhaseTimerStatusLabel}
            remainingRatio={embeddedPhaseTimerRemainingRatio}
            remainingSec={embeddedPhaseTimerRemainingSec}
            showResourcesWithoutLabel={embeddedPhaseTimerShowResourcesWithoutLabel}
          />
        ) : null}
        <div className={MSG_LIST_CONTAINER_CLASS} style={listInset} data-chat-interactive>
          <InGameChatMessageList messages={messages} textFieldWidth={textFieldWidth} />
        </div>
        {isDeadChat ? (
          <div className="pointer-events-none absolute" style={listInset}>
            <p className={DEAD_CHAT_BADGE_CLASS} data-dead-chat-badge="">죽은 사람끼리</p>
          </div>
        ) : null}
        <ChatTextFieldRow
          variant={variant} useUnifiedFrame={useUnifiedFrame}
          inputClosed={inputClosed} inputLocked={inputLocked} inputWrapRef={inputWrapRef}
          draft={draft} onDraftChange={onDraftChange} truncateDraftOnInput={truncateDraftOnInput} onSend={handleSend}
        />
        <div className={STATUS_LINE_WRAP_CLASS} style={getStatusLineInset(variant)}>
          <InGameChatStatusLine status={status} error={error} />
        </div>
      </div>
    </InGameChatVariantContext.Provider>
  )
}
