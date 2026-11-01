// 화면 틀 안의 자리 (바닥 자리 DOM 요소를 넘겨주는 context)
// MobileShell이 값을 넣고 ShellBottom이 꺼내 portal로 그림
import { createContext } from "react"

export const SHELL_BOTTOM_SLOT_ID = "mobile-shell-bottom"

export const ShellBottomSlotContext = createContext(null)
