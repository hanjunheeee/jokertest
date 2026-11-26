// 약관 전체 보기 창 (제목·버전·시행일·본문, 주소가 있으면 새 창 링크)
// 모바일 가입 약관 칸·재동의 창이 씀, 데스크톱 TermsViewDialog의 모바일판
import { MODAL_ASSETS } from "@/domains/game/matching/constants/friendInviteModalAssets.js"
import { termsLabelOf } from "@/domains/auth/utils/terms.js"
import ConfirmButton from "@m/shared/ui/modal/parchment/ConfirmButton.jsx"
import ParchmentTextDialog from "@m/shared/ui/modal/parchment/ParchmentTextDialog.jsx"
import { PARCHMENT_ALERT_MSG_CLASS } from "@m/shared/ui/modal/parchment/parchmentAlertStyle.js"
import { DIALOG_META_CLASS, TEXT_BTN_CLASS } from "@m/shared/ui/modal/textDialogStyle.js"

const COMPACT_BTN = "!w-[6.6rem]"
const COMPACT_LABEL = "px-0.5 !text-[0.84rem] leading-none whitespace-nowrap"

const BODY_PANEL_CLASS =
    "max-h-[min(44svh,22rem)] w-full min-h-0 overflow-y-auto overscroll-contain whitespace-pre-wrap px-0.5 py-1 text-left font-subheading font-semibold leading-relaxed text-[#2a1208] app-text-scaled [--app-text-size:0.86rem] land:max-h-[min(52svh,26rem)]"

const META_CLASS = `${DIALOG_META_CLASS} w-full text-left`

const effectiveDateText = (iso) => {
    const date = new Date(iso)
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })
}

export default function TermsView({ terms, onClose }) {
    const title = terms ? termsLabelOf(terms) : ""

    return (
        <ParchmentTextDialog open={Boolean(terms)} title={title} onClose={onClose}>
            {terms ? (
                <div className="flex w-full min-w-0 flex-col items-stretch gap-2 text-left">
                    <p className={META_CLASS}>
                        버전 {terms.version} · 시행일 {effectiveDateText(terms.effectiveAt)}
                    </p>
                    <div className={BODY_PANEL_CLASS} tabIndex={0}>
                        {terms.body || (
                            <span className={PARCHMENT_ALERT_MSG_CLASS}>
                                본문이 없습니다. 아래 주소에서 확인해주세요.
                            </span>
                        )}
                    </div>
                    {terms.url ? (
                        <a
                            href={terms.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`${TEXT_BTN_CLASS} self-start`}
                        >
                            전문 새 창으로 보기
                        </a>
                    ) : null}
                    <div className="mt-0.5 flex w-full justify-center">
                        <ConfirmButton
                            label="닫기"
                            onClick={onClose}
                            raised
                            sfxKind="ui-cancel"
                            src={MODAL_ASSETS.cancelButton}
                            buttonClassName={COMPACT_BTN}
                            labelClassName={COMPACT_LABEL}
                        />
                    </div>
                </div>
            ) : null}
        </ParchmentTextDialog>
    )
}
