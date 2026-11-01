// 모바일 방 설정 화면 모양 상수 (양피지 배경·버튼 줄 모양, 줄 모양은 game/shared/settings)
// setup 화면 컴포넌트들이 씀, 탭 목록은 데스크톱 GAME_SETUP_TABS 그대로
import { publicAsset } from "@/shared/utils/publicAsset"

// 양피지 그림 (서버 파일 이름이 NFC·NFD 어느 쪽이어도 보이게 두 겹), 세로 화면엔 데스크톱 가로 틀이 안 들어가서 종이만 씀
const PARCHMENT = "/frame/양피지 모달.png"
export const PARCHMENT_STYLE = {
  backgroundColor: "#cdb48c",
  backgroundImage: `url("${publicAsset(PARCHMENT)}"), url("${encodeURI(PARCHMENT.normalize("NFD"))}")`,
  // 그림 가장자리 어두운 테두리는 잘라내고 가운데 종이 부분만
  backgroundSize: "230% 165%",
  backgroundPosition: "center",
}

// 만들기·취소 그림 버튼 (그림 비율 그대로, 데스크톱 FORM_ACTION_* 글자 모양)
export const ACTION_LOOK = {
  button: "interactive-scale group relative block w-52 shrink-0 cursor-pointer border-0 bg-transparent p-0 leading-none disabled:cursor-not-allowed disabled:opacity-60 land:w-44",
  img: "block h-auto w-full select-none",
  label: "pointer-events-none absolute inset-0 flex items-center justify-center whitespace-nowrap font-subheading app-text-scaled [--app-text-size:1.15rem] font-bold tracking-tight text-[#f5f0e6] [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]",
}
