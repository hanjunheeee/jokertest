// 방 코드 입력칸 하나짜리 동작: 영문·숫자만 남기고 대문자·6자리로 자름, 자동 초점, 초점 여부
// CodeFrame이 씀, 데스크톱 useRoomCodeInput은 칸 6개짜리라 폰 키보드(한 칸에 이어 치기·붙여넣기)에 안 맞아 따로 둠
import { useEffect, useRef, useState } from "react"
import { normalizeRoomCodeText } from "@/domains/game/shared/utils/roomCode.js"

// 화면 나타난 뒤 초점 주는 시간 (데스크톱과 같은 0.28초)
const AUTO_FOCUS_DELAY_MS = 280

// 입력칸 ref·처리 함수·초점 상태
export function useCodeField({ onChange, autoFocus = false, onSubmit }) {
  const inputRef = useRef(null)
  const [focused, setFocused] = useState(false)

  // 자동 초점 (iOS는 사용자가 누르기 전엔 키보드를 안 띄움)
  useEffect(() => {
    if (!autoFocus) return undefined
    const timer = window.setTimeout(() => inputRef.current?.focus(), AUTO_FOCUS_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [autoFocus])

  // 치거나 붙여넣은 글 정리 (허용 글자만·6자리·대문자)
  const handleChange = (event) => {
    onChange(normalizeRoomCodeText(event.target.value).toUpperCase())
  }

  // 키보드 "이동/완료"로 바로 참여
  const handleKeyDown = (event) => {
    if (event.key !== "Enter") return
    event.preventDefault()
    onSubmit?.()
  }

  // 초점 받으면 커서를 끝으로 (중간 칸 고치기보다 이어 치기가 폰에서 자연스러움)
  const handleFocus = (event) => {
    setFocused(true)
    const input = event.target
    const end = input.value.length
    input.setSelectionRange?.(end, end)
  }

  return {
    inputRef,
    focused,
    handleChange,
    handleKeyDown,
    handleFocus,
    handleBlur: () => setFocused(false),
  }
}
