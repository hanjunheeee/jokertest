// 페이지 내용을 화면 틀의 바닥 자리에 그리는 portal
// 바닥 고정 버튼 줄(입장하기·게임 만들기·준비 등)이 쓰기
import { useContext } from "react"
import { createPortal } from "react-dom"
import { ShellBottomSlotContext } from "@m/shared/layouts/mobileShellSlots.js"

export default function ShellBottom({ children }) {
    const slot = useContext(ShellBottomSlotContext)

    // 틀이 자리를 다 그리기 전 첫 그림에선 건너뜀
    if (!slot) return null

    return createPortal(children, slot)
}
