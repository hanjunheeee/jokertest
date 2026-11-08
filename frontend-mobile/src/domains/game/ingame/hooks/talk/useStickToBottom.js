// 채팅방 맨 아래 붙어 있기: 맨 아래를 보던 중이면 새 줄이 올 때 따라 내려가고, 위로 올려 읽는 중이면 그대로 둠
// TalkList가 씀, 안 따라간 동안 새 줄이 오면 unseen이 참 → "새 메시지" 단추
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"

// 맨 아래에서 이만큼(px) 안이면 맨 아래로 봄
const NEAR_BOTTOM_PX = 48

export function useStickToBottom(scrollRef, lines) {
    const nearBottomRef = useRef(true)
    const [unseen, setUnseen] = useState(false)

    const scrollToBottom = useCallback(() => {
        const el = scrollRef.current
        if (!el) return
        el.scrollTop = el.scrollHeight
        nearBottomRef.current = true
        setUnseen(false)
    }, [scrollRef])

    // 줄 수·마지막 줄이 바뀔 때만 새 줄로 봄 (투표·상태만 바뀌어도 목록 배열은 새로 만들어짐)
    const lastKey = lines.length > 0 ? `${lines.length}:${lines[lines.length - 1].id}` : ""

    // 새 줄: 맨 아래 보던 중이면 내림, 아니면 알림만 (그린 직후 높이로 내리려고 layout effect)
    useLayoutEffect(() => {
        if (!lastKey) return
        if (nearBottomRef.current) scrollToBottom()
        else setUnseen(true)
    }, [lastKey, scrollToBottom])

    // 스크롤 위치 기억, 칸 높이가 바뀌면(키보드·띠 펼침) 맨 아래 보던 경우만 다시 내림
    useEffect(() => {
        const el = scrollRef.current
        if (!el) return undefined
        const onScroll = () => {
            const near = el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM_PX
            nearBottomRef.current = near
            if (near) setUnseen(false)
        }
        el.addEventListener("scroll", onScroll, { passive: true })
        const observer = typeof ResizeObserver === "undefined"
            ? null
            : new ResizeObserver(() => {
                if (nearBottomRef.current) el.scrollTop = el.scrollHeight
            })
        observer?.observe(el)
        return () => {
            el.removeEventListener("scroll", onScroll)
            observer?.disconnect()
        }
    }, [scrollRef])

    return { unseen, scrollToBottom }
}
