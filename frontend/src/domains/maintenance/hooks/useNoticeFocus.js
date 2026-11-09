// 점검 큰 안내 초점: 열리면 버튼에 초점, 닫히면 원래 자리로, Esc는 안내 버튼과 같은 일, Tab은 안내 안에 가둠
// 데스크톱·모바일 점검 큰 안내 창이 씀
import { useEffect, useRef } from "react"

// openKey: 열릴 때마다 바뀌는 값 (null이면 닫힘), onEscape: Esc 때 할 일
export function useNoticeFocus(openKey, onEscape) {
  const buttonRef = useRef(null)
  const escapeRef = useRef(onEscape)
  useEffect(() => {
    escapeRef.current = onEscape
  })

  // 열리면 버튼에 초점, 닫히면 열기 전 초점 자리로
  useEffect(() => {
    if (!openKey) return undefined
    const before = document.activeElement
    buttonRef.current?.focus({ preventScroll: true })
    return () => {
      if (before && before !== document.body && document.contains(before)) before.focus?.({ preventScroll: true })
    }
  }, [openKey])

  // Esc: 판 화면의 다른 Esc 처리보다 먼저 받고 넘기지 않음 (안내만 닫힘)
  useEffect(() => {
    if (!openKey) return undefined
    const onKey = (event) => {
      if (event.key !== "Escape") return
      event.preventDefault()
      event.stopPropagation()
      escapeRef.current?.()
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [openKey])

  // 버튼이 하나라 Tab은 늘 그 버튼으로
  const onKeyDown = (event) => {
    if (event.key !== "Tab") return
    event.preventDefault()
    buttonRef.current?.focus({ preventScroll: true })
  }

  return { buttonRef, onKeyDown }
}
