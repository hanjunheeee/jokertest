// Discord 계정 연결 칸 (연결 결과 문구 + 연결하기 버튼)
// AccountPanel이 씀, 동작은 useDiscordLink

import { useDiscordLink } from "@m/domains/user/hooks/account/useDiscordLink.js"
import ConfirmButton from "./ConfirmButton.jsx"
import Feedback from "./Feedback.jsx"
import SectionTitle from "./SectionTitle.jsx"

// 결과 문구는 눌러서 닫음
export default function DiscordSection() {
    const { message, clearMessage, startLink } = useDiscordLink()

    return (
        <section className="flex flex-col gap-2">
            <SectionTitle>Discord 계정 연결</SectionTitle>

            <form onSubmit={startLink} className="flex w-full flex-col gap-2">
                {message ? (
                    <button
                        type="button"
                        onClick={clearMessage}
                        aria-label="연결 결과 메시지 닫기"
                        className="block min-h-11 w-full cursor-pointer border-0 bg-transparent p-0 text-left"
                    >
                        <Feedback msg={message} />
                    </button>
                ) : null}
                <div className="flex w-full justify-end">
                    <ConfirmButton label="연결하기" />
                </div>
            </form>
        </section>
    )
}
