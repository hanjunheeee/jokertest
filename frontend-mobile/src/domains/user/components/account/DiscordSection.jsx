// Discord 계정 연결 칸 (연결 결과 문구 + 연결하기 버튼 + 연결 확인 창)
// AccountPanel이 씀, 동작은 useDiscordLink

import {
    ACCOUNT_FORM_ACTIONS_ROW_CLASS,
    ACCOUNT_FORM_ALIGN_CLASS,
    ACCOUNT_SECTION_CLASS,
    ACCOUNT_SECTION_FORM_CLASS,
} from "@m/domains/user/constants/accountFormLayout.js"
import { useDiscordLink } from "@m/domains/user/hooks/account/useDiscordLink.js"
import ConfirmButton from "./ConfirmButton.jsx"
import DiscordLinkConfirmDialog from "./DiscordLinkConfirmDialog.jsx"
import Feedback from "./Feedback.jsx"
import SectionTitle from "./SectionTitle.jsx"

// 결과 문구는 눌러서 닫음
export default function DiscordSection() {
    const { message, clearMessage, startLink, confirmOpen, confirmLink, cancelLink } = useDiscordLink()

    return (
        <section className={`${ACCOUNT_SECTION_CLASS} border-b-0 pb-0`}>
            <SectionTitle>Discord 계정 연결</SectionTitle>

            <form onSubmit={startLink} className={ACCOUNT_SECTION_FORM_CLASS}>
                {message ? (
                    <button
                        type="button"
                        onClick={clearMessage}
                        aria-label="연결 결과 메시지 닫기"
                        className={`${ACCOUNT_FORM_ALIGN_CLASS} block min-h-7 cursor-pointer border-0 bg-transparent p-0 text-left`}
                    >
                        <Feedback msg={message} />
                    </button>
                ) : null}
                <div className={ACCOUNT_FORM_ACTIONS_ROW_CLASS}>
                    <ConfirmButton label="연결하기" />
                </div>
            </form>
            <DiscordLinkConfirmDialog open={confirmOpen} onConfirm={confirmLink} onCancel={cancelLink} />
        </section>
    )
}
