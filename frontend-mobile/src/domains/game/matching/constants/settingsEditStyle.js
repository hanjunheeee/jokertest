// 대기방 설정 변경 화면 모양: 양피지 본문 배경·탭 버튼·저장/취소 버튼
// settingsEdit 아래 컴포넌트가 씀, 모바일 방 설정 화면(GameSetupPage)과 같은 모양 (데스크톱은 같은 GameSetupPanel 편집 모드)
import { publicAsset } from "@/shared/utils/publicAsset.js"

// 양피지 그림 (서버 파일 이름이 NFC·NFD 어느 쪽이어도 보이게 두 겹), 가운데 종이 부분만
const PARCHMENT = "/frame/양피지 모달.png"
export const PARCHMENT_STYLE = {
  backgroundColor: "#cdb48c",
  backgroundImage: `url("${publicAsset(PARCHMENT)}"), url("${encodeURI(PARCHMENT.normalize("NFD"))}")`,
  backgroundSize: "230% 165%",
  backgroundPosition: "center",
}

// 탭 버튼·그림·글자 (데스크톱 GameSetupTabs 글자)
export const TAB_BTN_CLASS =
  "group relative flex min-h-11 min-w-0 flex-1 cursor-pointer items-center justify-center border-0 bg-transparent p-0 leading-none land:flex-none"
export const TAB_IMG_CLASS =
  "pointer-events-none absolute inset-0 block h-full w-full select-none object-fill transition-transform group-active:scale-[0.97]"
export const TAB_LABEL_CLASS =
  "pointer-events-none relative whitespace-nowrap px-1 font-subheading app-text-scaled [--app-text-size:1.1rem] font-bold tracking-tight text-[#f5f0e6] [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]"

// 저장·취소 그림 버튼 (그림 비율 그대로, 두 개가 폰 폭에 들어가게 반 폭까지, 데스크톱 FORM_ACTION_* 글자)
export const ACTION_LOOK = {
  button:
    "interactive-scale group relative block w-[min(13rem,calc(50vw-1.5rem))] shrink-0 cursor-pointer border-0 bg-transparent p-0 leading-none disabled:cursor-not-allowed disabled:opacity-60 land:w-44",
  img: "block h-auto w-full select-none",
  label:
    "pointer-events-none absolute inset-0 flex items-center justify-center whitespace-nowrap font-subheading app-text-scaled [--app-text-size:1.15rem] font-bold tracking-tight text-[#f5f0e6] [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]",
}
