// 세로 카톡형: 최후의 변론을 닫을 수 있는 양피지 시트 (피고 카드·유무죄)
// TalkLayout이 채팅 위에 띄움, 값은 useTribunalPresentation
import Sheet from "@m/domains/game/ingame/components/sheets/frame/Sheet.jsx"
import DefendantCard from "./DefendantCard.jsx"
import TribunalActions from "./TribunalActions.jsx"

const TITLE = "최후의 변론"

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
    devResolveLabel,
    devResolveEnabled,
    onDevResolve,
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
                        devResolveLabel={devResolveLabel}
                        devResolveEnabled={devResolveEnabled}
                        onDevResolve={onDevResolve}
                    />
                </div>
            </div>
        </Sheet>
    )
}