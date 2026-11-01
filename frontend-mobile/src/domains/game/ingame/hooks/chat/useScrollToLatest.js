// 메시지 목록 맨 아래 따라가기: 메시지 바뀌면 다음 프레임에 맨 아래로 (데스크톱 목록과 같음)
// MessageList가 씀, 칸 높이가 바뀌면(키보드·회전) 맨 아래 보던 경우만 다시 맨 아래
import { useEffect, useRef } from "react"

// 맨 아래에서 이만큼(px) 안이면 맨 아래로 봄
const NEAR_BOTTOM_PX = 48

// 그려진 뒤 높이로 내리려고 requestAnimationFrame 씀
export function useScrollToLatest(scrollRef, messages) {
    const nearBottomRef = useRef(true)

    // 메시지 바뀌면 맨 아래로
    useEffect(() => {
        const el = scrollRef.current
        if (!el) return undefined
        const frame = requestAnimationFrame(() => {
            el.scrollTop = el.scrollHeight
            nearBottomRef.current = true
        })
        return () => cancelAnimationFrame(frame)
    }, [scrollRef, messages])

    // 스크롤할 때 맨 아래 근처인지 기억, 칸 높이 바뀌면 그 값 따라 다시 내림
    useEffect(() => {
        const el = scrollRef.current
        if (!el) return undefined
        const onScroll = () => {
            nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM_PX
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
}
