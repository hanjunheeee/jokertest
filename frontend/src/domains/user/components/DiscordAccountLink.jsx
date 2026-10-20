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

// F-07 AC-04/D-01: 로그인한 사용자가 Discord 계정을 자기 계정에 명시적으로 연결하는
// 컨트롤입니다. 연결 자체는 서버가 시작하는 페이지 이동(GET /auth/discord/link, 로그인한
// 사용자만 verifyToken을 통과합니다)이라 이 컴포넌트는 그 이동을 시작하기만 하고,
// 돌아온 뒤(discordLinkCallback이 /account로 돌려보내며 싣는 socialLinkSuccess/
// socialLinkError 쿼리)의 결과를 읽어 보여줍니다.
export default function DiscordAccountLink() {
  const [searchParams, setSearchParams] = useSearchParams()

  const message = resolveDiscordLinkMessage({
    socialLinkSuccess: searchParams.get("socialLinkSuccess"),
    socialLinkError: searchParams.get("socialLinkError"),
  })

  // 결과를 한 번 보여준 뒤에는 쿼리를 지워, 새로고침이나 뒤로가기로 같은 화면에 다시 와도
  // 지난 시도의 성공/실패 메시지가 또 뜨지 않게 합니다(LoginPage.jsx clearSocialParams와
  // 같은 원칙).
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
    // 소셜 계정 연결은 이 계정에 새 로그인 수단을 추가하는, 가볍게 되돌리기 어려운
    // 변경입니다 — 실제 Discord 동의 화면으로 페이지 전체가 이동하기 전에 한 번 더
    // 명시적으로 확인을 받습니다.
    //
    // F-16(AC-01): 확인/취소의 단일 소유자는 이 native confirm의 **반환값**이다. form 자체는
    // 제출 표식을 달지 않고(submit 버튼은 generic capture에서 이미 제외된다), 대화상자에는
    // click 이벤트가 없으므로 호출마다 단일 actionId를 발급한다(dispatchUiSfx를 이벤트 없이
    // 호출). 실제 페이지 이동·계정 변경은 아래 원래 동작이 그대로 수행한다.
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
              {/* 연결 성공/취소/실패 메시지입니다. 나타난 뒤에는 쿼리를 지워 재현되지 않게 합니다. */}
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
