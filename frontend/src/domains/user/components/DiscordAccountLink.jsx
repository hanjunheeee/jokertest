import { useSearchParams } from "react-router-dom"
import {
  ACCOUNT_PANEL_ACTION_AREA_CLASS,
  ACCOUNT_PANEL_ACTION_BUTTON_ROW_CLASS,
  ACCOUNT_PANEL_FEEDBACK_LINE_CLASS,
  ACCOUNT_PANEL_FORM_CLASS,
  ACCOUNT_PANEL_FORM_HEADING_CLASS,
  ACCOUNT_PANEL_SECTION_CLASS,
} from "@/domains/user/constants/accountPanelStyle.js"
import ConfirmButton from "@/domains/user/components/AccountPanel/ConfirmButton.jsx"
import FeedbackMsg from "@/domains/user/components/AccountPanel/FeedbackMsg.jsx"
import { resolveDiscordLinkMessage } from "@/domains/user/hooks/useDiscordAccountLink.js"
import { API_BASE_URL } from "@/shared/env.js"
import { dispatchUiSfx } from "@/shared/hooks/useSfxRuntime.js"

export default function DiscordAccountLink() {
  const [searchParams, setSearchParams] = useSearchParams()

  const message = resolveDiscordLinkMessage({
    socialLinkSuccess: searchParams.get("socialLinkSuccess"),
    socialLinkError: searchParams.get("socialLinkError"),
  })

  const clearLinkParams = () => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete("socialLinkSuccess")
      next.delete("socialLinkError")
      return next
    }, { replace: true })
  }

  const handleLinkDiscord = (e) => {
    e.preventDefault()
    const confirmed = window.confirm("Discord 계정을 이 계정에 연결하시겠습니까?")
    dispatchUiSfx(confirmed ? "ui-confirm" : "ui-cancel")
    if (!confirmed) return
    window.location.href = `${API_BASE_URL}/auth/discord/link`
  }

  return (
    <section className={ACCOUNT_PANEL_SECTION_CLASS}>
      <h3 className={ACCOUNT_PANEL_FORM_HEADING_CLASS}>Discord 계정 연결</h3>

      <form onSubmit={handleLinkDiscord} className={ACCOUNT_PANEL_FORM_CLASS}>
        <div className={ACCOUNT_PANEL_ACTION_AREA_CLASS}>
          {message ? (
            <div className={ACCOUNT_PANEL_FEEDBACK_LINE_CLASS}>
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
          <div className={ACCOUNT_PANEL_ACTION_BUTTON_ROW_CLASS}>
            <ConfirmButton label="연결하기" />
          </div>
        </div>
      </form>
    </section>
  )
}
