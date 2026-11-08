// 창 초점 관리: 열리면 창으로 초점 옮김, Tab은 창 안에서만 돎, 닫히면 원래 자리로 되돌림 (외부 키보드·화면 읽기)
// 인게임 카드 시트·설정/기록 시트·투표 현황·사망 선택·채팅 크게 보기가 role="dialog" 칸에 ref로 붙임
import { useCallback } from "react"

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

function focusablesIn(node) {
    return [...node.querySelectorAll(FOCUSABLE)].filter((el) => !el.closest("[inert]"))
}

// Tab이 창 끝에서 처음으로, Shift+Tab이 처음에서 끝으로
function trapTab(node, event) {
    if (event.key !== "Tab") return
    const list = focusablesIn(node)
    if (list.length === 0) {
        event.preventDefault()
        return
    }
    const first = list[0]
    const last = list[list.length - 1]
    if (event.shiftKey && (document.activeElement === first || document.activeElement === node)) {
        event.preventDefault()
        last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
    }
}

// 바깥에서 같은 칸을 따로 재야 할 때(카드 메뉴 바깥 누름) 그 ref도 채움
function assignRef(ref, node) {
    if (ref) ref.current = node
}

// 첫 입력칸 대신 창 자체에 초점: 폰에서 입력칸에 초점이 가면 키보드가 저절로 뜸
// React 19 ref 정리 함수로 닫힘(빠짐) 때 되돌림
export function useDialogFocus(extraRef = null) {
    return useCallback((node) => {
        assignRef(extraRef, node)
        if (!node) return undefined
        const previous = document.activeElement
        if (!node.hasAttribute("tabindex")) node.setAttribute("tabindex", "-1")
        if (!node.contains(document.activeElement)) node.focus({ preventScroll: true })
        const onKeyDown = (event) => trapTab(node, event)
        node.addEventListener("keydown", onKeyDown)
        return () => {
            node.removeEventListener("keydown", onKeyDown)
            assignRef(extraRef, null)
            // 입력칸으로는 안 되돌림: 폰에서 키보드가 저절로 다시 뜸
            if (!(previous instanceof HTMLElement) || !previous.isConnected) return
            if (previous.matches("input, textarea, [contenteditable]")) return
            previous.focus({ preventScroll: true })
        }
    }, [extraRef])
}
