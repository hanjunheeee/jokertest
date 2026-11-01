// 모바일 방 설정 화면 모양 상수 (탭 목록·줄·글자·양피지 배경)
// setup 화면 컴포넌트들이 씀
import { GAME_SETUP_TABS } from "@/domains/game/setup/constants/gameSetupOptions.js"
import { publicAsset } from "@/shared/utils/publicAsset"

// 데스크톱 두 탭 + 역할 구성 탭 (세로 화면에서 일반 탭이 너무 길어지지 않게 분리)
export const SETUP_TABS = [...GAME_SETUP_TABS, { id: "roles", label: "역할 배정" }]

// 설정 줄: 좁으면 조작칸이 다음 줄 오른쪽으로 내려감
export const ROW_CLASS =
  "flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-b border-[#8b7355]/35 py-3 last:border-b-0"

export const ROW_TEXT_CLASS = "min-w-[9rem] flex-1"

export const TITLE_CLASS =
  "font-subheading app-text-scaled [--app-text-size:1.05rem] font-bold leading-tight text-[#1a1008]"

export const DESC_CLASS =
  "mt-1 font-subheading app-text-scaled [--app-text-size:0.85rem] leading-snug text-[#2a1810]/85"

// 양피지 그림 (서버 파일 이름이 NFC·NFD 어느 쪽이어도 보이게 두 겹)
const PARCHMENT = "/frame/양피지 모달.png"
export const PARCHMENT_STYLE = {
  backgroundColor: "#cdb48c",
  backgroundImage: `url("${publicAsset(PARCHMENT)}"), url("${encodeURI(PARCHMENT.normalize("NFD"))}")`,
  // 그림 가장자리 어두운 테두리는 잘라내고 가운데 종이 부분만
  backgroundSize: "230% 165%",
  backgroundPosition: "center",
}
