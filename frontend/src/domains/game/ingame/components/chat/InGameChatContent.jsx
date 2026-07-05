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
  // useState(초기값)은 [현재값, 값을 바꾸는 함수]를 반환합니다.
  // 값을 바꾸는 함수를 호출해야만 컴포넌트가 리렌더링되며 화면이 갱신됩니다.

  // draft: 입력창에 아직 전송하지 않고 작성 중인 텍스트
  const [draft, setDraft] = useState("")
  // messages: 지금까지 전송된 채팅 메시지 배열 (로컬 상태 — 서버 연동 전 프로토타입)
  const [messages, setMessages] = useState([])
  // layoutReady: 프레임 레이아웃 계산이 끝났는지 여부. 끝나기 전엔 opacity 0으로 숨겨
  // 레이아웃이 잡히기 전 모습(깜빡임)이 보이지 않도록 함
  const [layoutReady, setLayoutReady] = useState(false)
  const [textFieldWidth, setTextFieldWidth] = useState(0)
  const inputWrapRef = useRef(null)

  // useEffect(콜백, 의존성배열)는 렌더링 후 실행되는 부수효과를 등록합니다.
  // 의존성 배열이 빈 배열([])이면 컴포넌트가 처음 마운트될 때 딱 한 번만 실행됩니다.
  // 여기서는 다음 애니메이션 프레임에 layoutReady를 true로 바꿔 opacity 전환을 트리거합니다.
  // return한 함수는 cleanup(정리) 함수로, 컴포넌트가 언마운트되거나 effect가 다시 실행되기 전에
  // 호출됩니다 — 아직 실행되지 않은 requestAnimationFrame 예약을 취소해 메모리 누수를 막습니다.
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
