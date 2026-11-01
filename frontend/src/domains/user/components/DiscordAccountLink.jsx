// Discord 계정 연결 칸 (연결 결과 문구 + 연결하기 버튼)
// AccountPanel이 씀
import { useSearchParams } from "react-router-dom"
import {
  PANEL_ACTION_AREA_CLASS,
  PANEL_ACTION_BTN_ROW_CLASS,
  PANEL_FEEDBACK_LINE_CLASS,
  PANEL_FORM_CLASS,
  PANEL_FORM_HEADING_CLASS,
  PANEL_SECTION_CLASS,
} from "@/domains/user/constants/accountPanelStyle.js"
import ConfirmButton from "@/domains/user/components/AccountPanel/ConfirmButton.jsx"
import FeedbackMsg from "@/domains/user/components/AccountPanel/FeedbackMsg.jsx"
import { resolveDiscordLinkMessage } from "@/domains/user/hooks/useDiscordAccountLink.js"
import { API_BASE_URL } from "@/shared/env.js"
import { dispatchUiSfx } from "@/shared/hooks/useSfxRuntime.js"

// 결과 문구는 주소의 socialLinkSuccess·socialLinkError로 정함
export default function DiscordAccountLink() {
  const [searchParams, setSearchParams] = useSearchParams()

  const message = resolveDiscordLinkMessage({
    socialLinkSuccess: searchParams.get("socialLinkSuccess"),
    socialLinkError: searchParams.get("socialLinkError"),
  })

  // 결과 문구 닫기: 주소에서 두 표시를 지움 (방문 기록은 안 남김)
  const clearLinkParams = () => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete("socialLinkSuccess")
      next.delete("socialLinkError")
      return next
    }, { replace: true })
  }

  // 연결하기: 한 번 더 묻고, 그렇다면 서버 연결 주소로 이동
  const handleLinkDiscord = (e) => {
    e.preventDefault()
    const confirmed = window.confirm("Discord 계정을 이 계정에 연결하시겠습니까?")
    dispatchUiSfx(confirmed ? "ui-confirm" : "ui-cancel")
    if (!confirmed) return
    window.location.href = `${API_BASE_URL}/auth/discord/link`
  }

  return (
    <section className={PANEL_SECTION_CLASS}>
      <h3 className={PANEL_FORM_HEADING_CLASS}>Discord 계정 연결</h3>

      <form onSubmit={handleLinkDiscord} className={PANEL_FORM_CLASS}>
        <div className={PANEL_ACTION_AREA_CLASS}>
          {/* 결과 문구는 눌러서 닫음 */}
          {message ? (
            <div className={PANEL_FEEDBACK_LINE_CLASS}>
              <button
                type="button"
                onClick={clearLinkParams}
                className="block w-full text-left"
                aria-label="연결 결과 메시지 닫기"
              >
                <FeedbackMsg msg={message} />
              </button>
            </div>
          ) : null}
          <div className={PANEL_ACTION_BTN_ROW_CLASS}>
            <ConfirmButton label="연결하기" />
          </div>
        </div>
      </form>
    </section>
  )
}
