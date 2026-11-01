// 입력칸 높이 맞추기: 글 줄 수만큼 늘리고 최대 높이(css max-h)에서 멈춤
// Composer가 씀 (iOS Safari가 field-sizing을 못 써서 JS로 잼)
import { useLayoutEffect } from "react"

// 글이 바뀔 때마다 높이를 비웠다가 내용 높이로 다시 맞춤
export function useAutoGrow(textareaRef, value) {
    useLayoutEffect(() => {
        const el = textareaRef.current
        if (!el) return
        el.style.height = "auto"
        el.style.height = `${el.scrollHeight + 2}px`
    }, [textareaRef, value])
}
