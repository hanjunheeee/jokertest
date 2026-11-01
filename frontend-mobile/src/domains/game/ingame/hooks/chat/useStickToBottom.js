// 메시지 목록 아래 붙이기: 맨 아래 보고 있을 때만 새 메시지 따라 내림, 위로 올려 읽는 중이면 안 끌어내림
// MessageList가 씀 (데스크톱은 늘 맨 아래로, 폰은 손가락 스크롤이라 읽던 자리 지킴)
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"

// 맨 아래에서 이만큼(px) 안이면 맨 아래로 봄
const NEAR_BOTTOM_PX = 48

// 마지막 메시지 id가 바뀌면 새 메시지로 셈
export function useStickToBottom(scrollRef, messages) {
    const stickRef = useRef(true)
    const lastIdRef = useRef(null)
    const [unread, setUnread] = useState(0)

    // 맨 아래로 내리고 안 읽은 수 지움
    const scrollToBottom = useCallback(() => {
        const el = scrollRef.current
        if (!el) return
        el.scrollTop = el.scrollHeight
        stickRef.current = true
        setUnread(0)
    }, [scrollRef])

    // 스크롤할 때 맨 아래 근처인지 기억
    useEffect(() => {
        const el = scrollRef.current
        if (!el) return undefined
        const onScroll = () => {
            const near = el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM_PX
            stickRef.current = near
            if (near) setUnread(0)
        }
        el.addEventListener("scroll", onScroll, { passive: true })
        return () => el.removeEventListener("scroll", onScroll)
    }, [scrollRef])

    // 그리기 전에 내려서 깜빡임 없게, 읽는 중이면 새 수만 셈
    useLayoutEffect(() => {
        const lastId = messages.length > 0 ? messages[messages.length - 1].id : null
        const prevId = lastIdRef.current
        lastIdRef.current = lastId
        if (lastId === prevId) return
        if (stickRef.current) {
            scrollToBottom()
            return
        }
        // 한 번에 여러 개 와도 센 만큼 (지난 마지막 글 뒤 개수, 못 찾으면 1)
        const prevIndex = messages.findIndex((message) => message.id === prevId)
        const added = prevIndex >= 0 ? messages.length - 1 - prevIndex : 1
        setUnread((count) => count + added)
    }, [messages, scrollToBottom])

    // 칸 높이 바뀌면(키보드·회전) 붙어 있던 경우 다시 맨 아래
    useEffect(() => {
        const el = scrollRef.current
        if (!el || typeof ResizeObserver === "undefined") return undefined
        const observer = new ResizeObserver(() => {
            if (stickRef.current) el.scrollTop = el.scrollHeight
        })
        observer.observe(el)
        return () => observer.disconnect()
    }, [scrollRef])

    return { unread, scrollToBottom }
}
