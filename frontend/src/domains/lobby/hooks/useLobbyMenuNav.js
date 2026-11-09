// 로비 메뉴 누름 처리 (화면 이동·종료는 로그아웃·고객센터는 문의 창 열고 닫기)
// LobbyMenuNav·모바일 MenuNav가 씀
import { useCallback, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { logoutApi } from "@/domains/auth/api/auth.api"
import { useAuthStore } from "@/domains/auth/store/auth.store"
import { LOBBY_MENU_ROUTES } from "@/domains/lobby/constants/lobbyMenu.js"
import { INQUIRY_PARAM, toInquiryIdText } from "@/shared/constants/notificationTargets.js"

// 서버 로그아웃 실패 때 묻는 글 (확인 = 이 기기에서만 로그아웃)
const LOGOUT_FAILED_CONFIRM =
  "로그아웃 요청이 실패했습니다. 이 기기 화면에서만 로그아웃할까요? (새로고침하면 다시 로그인될 수 있습니다) 취소를 누르면 그대로 남아 다시 시도할 수 있습니다."

// 서버 로그아웃 성공이면 참, 실패면 이 기기에서만 로그아웃할지 물어 답을 줌
async function logoutOrAsk() {
  try {
    await logoutApi()
    return true
  } catch {
    return typeof window.confirm === "function" && window.confirm(LOGOUT_FAILED_CONFIRM)
  }
}

// 고객센터 메뉴 id (경로 이동 대신 문의 창을 엶)
export const CUSTOMER_SUPPORT_MENU_ID = "customerSupport"

// 주소의 문의 id (알림 "문의 답 보기"가 실음), 없거나 이상하면 null
// 예) ?inquiryId=7 → "7" / ?inquiryId=abc → null
export function parseInquiryTargetId(searchParams) {
  const raw = typeof searchParams?.get === "function" ? searchParams.get(INQUIRY_PARAM) : null
  return toInquiryIdText(raw)
}

// 문의 창 열림: 고객센터 누름 또는 주소에 문의 id가 새로 들어옴, 닫으면 주소의 id도 지움
function useInquiryWindowState(navigate) {
  const [searchParams] = useSearchParams()
  const inquiryTargetId = parseInquiryTargetId(searchParams)
  const [inquiryOpen, setInquiryOpen] = useState(() => inquiryTargetId !== null)

  // 그리는 중에 대상 바뀜을 보고 엶 (effect 안 setState 안 씀)
  const [seenTargetId, setSeenTargetId] = useState(inquiryTargetId)
  if (seenTargetId !== inquiryTargetId) {
    setSeenTargetId(inquiryTargetId)
    if (inquiryTargetId !== null) setInquiryOpen(true)
  }

  const openInquiry = useCallback(() => setInquiryOpen(true), [])
  // id가 남아 있으면 같은 알림을 다시 눌러도 주소가 안 바뀌어 안 열림 → 닫을 때 지움
  const closeInquiry = useCallback(() => {
    setInquiryOpen(false)
    if (inquiryTargetId === null) return
    const rest = new URLSearchParams(searchParams.toString())
    rest.delete(INQUIRY_PARAM)
    const search = rest.toString()
    navigate({ search: search ? `?${search}` : "" }, { replace: true })
  }, [inquiryTargetId, navigate, searchParams])

  return { inquiryOpen, inquiryTargetId, openInquiry, closeInquiry }
}

// 지금 고른 메뉴·누름 처리·문의 창 열림을 줌
export function useLobbyMenuNav() {
  const navigate = useNavigate()

  const [activeMenu, setActiveMenu] = useState("gameplay")
  const inquiry = useInquiryWindowState(navigate)

  const handleMenuClick = async (itemId) => {
    // 고객센터는 고른 메뉴 표시 없이 문의 창만 엶
    if (itemId === CUSTOMER_SUPPORT_MENU_ID) {
      inquiry.openInquiry()
      return
    }

    setActiveMenu(itemId)

    // 종료: 서버 로그아웃이 실패하면 쿠키 세션이 살아 있어 새로고침 때 다시 로그인됨 → 알리고 고르게 함
    if (itemId === "exit") {
      if (!(await logoutOrAsk())) return
      useAuthStore.getState().logout()
      navigate("/login")
      return
    }

    // 나머지는 경로 표대로 이동 (표에 없으면 그대로)
    const route = LOBBY_MENU_ROUTES[itemId]
    if (route) navigate(route)
  }

  return { activeMenu, handleMenuClick, ...inquiry }
}
