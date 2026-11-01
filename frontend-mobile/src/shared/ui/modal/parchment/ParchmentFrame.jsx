// 세로 화면용 양피지 판: 가로형 양피지 그림을 9칸 자르기(border-image)로 늘려 모서리 장식 유지
// 연출 양피지 창(ParchmentDialog)·밤 연출 대기 창·대기방 시작 막힘 창이 씀, 데스크톱 양피지 창(InGameParchmentPanelBase)과 같은 그림
import { IMG_URL } from "@/domains/game/ingame/constants/parchment/ingameParchmentLayout.js"
import { publicAsset } from "@/shared/utils/publicAsset.js"

// 그림(1536x1024) 자르는 선: 모서리 장식까지 (위·오른쪽·아래·왼쪽, 그림 px)
const SLICE = { t: 250, r: 360, b: 330, l: 300 }
// 그림 가장자리 투명한 폭 (판 밖으로 밀어내서 내용 칸을 넓힘)
const CLEAR = { t: 120, r: 200, b: 154, l: 170 }

// --pk = 그림 1px이 화면 몇 px인지 (폰 0.2, 태블릿 0.28)
const px = (n) => `calc(var(--pk) * ${n}px)`
const neg = (n) => `calc(var(--pk) * -${n}px)`

const DECOR_STYLE = {
    top: neg(CLEAR.t),
    right: neg(CLEAR.r),
    bottom: neg(CLEAR.b),
    left: neg(CLEAR.l),
    borderStyle: "solid",
    borderColor: "transparent",
    borderWidth: `${px(SLICE.t)} ${px(SLICE.r)} ${px(SLICE.b)} ${px(SLICE.l)}`,
    borderImage: `url("${publicAsset(IMG_URL)}") ${SLICE.t} ${SLICE.r} ${SLICE.b} ${SLICE.l} fill stretch`,
}

// 장식 안쪽에 글이 오도록 띄움 (자르는 선 - 투명 폭 + 조금)
const CONTENT_STYLE = {
    paddingTop: `calc(var(--pk) * ${SLICE.t - CLEAR.t}px + 0.25rem)`,
    paddingRight: `calc(var(--pk) * ${SLICE.r - CLEAR.r}px + 0.25rem)`,
    paddingBottom: `calc(var(--pk) * ${SLICE.b - CLEAR.b}px + 0.25rem)`,
    paddingLeft: `calc(var(--pk) * ${SLICE.l - CLEAR.l}px + 0.25rem)`,
}

const FRAME_CLASS =
    "pointer-events-auto relative w-[min(100vw-2.5rem,24rem)] select-none [--pk:0.2] md:w-[30rem] md:[--pk:0.28] land:w-[min(70vw,28rem)] land:[--pk:0.17]"

const CONTENT_CLASS =
    "relative flex min-h-[9rem] max-h-[min(72svh,36rem)] flex-col items-center justify-center gap-2 overflow-y-auto overscroll-contain text-center text-[#3a1a0c] land:max-h-[78svh] land:gap-1.5"

// 양피지 한 장, 넘치면 안쪽만 스크롤
export default function ParchmentFrame({ className = "", children, ...rest }) {
    return (
        <div className={`${FRAME_CLASS} ${className}`.trim()} {...rest}>
            <div aria-hidden="true" className="pointer-events-none absolute" style={DECOR_STYLE} />
            <div className={CONTENT_CLASS} style={CONTENT_STYLE} data-parchment-content="true">
                {children}
            </div>
        </div>
    )
}
