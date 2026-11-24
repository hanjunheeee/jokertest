// 세로 카톡형: 최후의 변론을 닫을 수 있는 양피지 시트 (피고 카드·유무죄·표 거절 까닭, 판정은 서버가 5초 뒤 함)
// TalkLayout이 채팅 위에 띄움, 값은 useTribunalPresentation
import { NOTICE_CLASS } from "@/domains/game/ingame/constants/tribunalPresentation/ingameTribunalPresentationLayout.js"
import Sheet from "@m/domains/game/ingame/components/sheets/frame/Sheet.jsx"
import DefendantCard from "./DefendantCard.jsx"
import TribunalActions from "./TribunalActions.jsx"

const TITLE = "최후의 변론"

// 안내·거절 까닭 글: 흰 글이라 양피지 위에선 안 읽혀 어두운 칸을 깖 (가로 연출 창의 맨 위 거절 글과 같은 모양)
const SHEET_NOTICE_CLASS = `${NOTICE_CLASS} max-w-full rounded-md bg-black/70 px-4 py-2`

export default function TribunalSheet({
    open,
    onClose,
    defendant,
    showVoteButtons,
    noticeText,
    voteButtonsEnabled,
    voteSubmitting,
    onVoteGuilty,
    onVoteNotGuilty,
    voteErrorText = null,
}) {
    if (!defendant) return null

    return (
        <Sheet
            open={open}
            onClose={onClose}
            title={TITLE}
            subtitle={defendant.nickname ? `피고: ${defendant.nickname}` : null}
            ariaLabel={TITLE}
            closeLabel={`${TITLE} 닫기`}
            testId="tribunal-presentation-sheet"
            layer="top"
        >
            <div className="flex flex-col items-center gap-4 px-1 pb-2 pt-1">
                <DefendantCard defendant={defendant} className="w-[min(72vw,13.5rem)]" />
                <div className="flex w-full max-w-[20rem] flex-col items-center gap-3">
                    <TribunalActions
                        showVoteButtons={showVoteButtons}
                        noticeText={noticeText}
                        voteDisabled={!voteButtonsEnabled || voteSubmitting}
                        onVoteGuilty={onVoteGuilty}
                        onVoteNotGuilty={onVoteNotGuilty}
                        noticeClassName={SHEET_NOTICE_CLASS}
                    />
                    {voteErrorText ? (
                        <p role="alert" className={SHEET_NOTICE_CLASS} data-ingame-tribunal-vote-error="">
                            {voteErrorText}
                        </p>
                    ) : null}
                </div>
            </div>
        </Sheet>
    )
}