// 모바일 방 설정 화면 모양 상수 (탭 목록·양피지 배경, 줄 모양은 game/shared/settings)
// setup 화면 컴포넌트들이 씀
import { GAME_SETUP_TABS } from "@/domains/game/setup/constants/gameSetupOptions.js"
import { publicAsset } from "@/shared/utils/publicAsset"

// 데스크톱 두 탭 + 역할 구성 탭 (세로 화면에서 일반 탭이 너무 길어지지 않게 분리)
export const SETUP_TABS = [...GAME_SETUP_TABS, { id: "roles", label: "역할 배정" }]

// 양피지 그림 (서버 파일 이름이 NFC·NFD 어느 쪽이어도 보이게 두 겹)
const PARCHMENT = "/frame/양피지 모달.png"
export const PARCHMENT_STYLE = {
  backgroundColor: "#cdb48c",
  backgroundImage: `url("${publicAsset(PARCHMENT)}"), url("${encodeURI(PARCHMENT.normalize("NFD"))}")`,
  // 그림 가장자리 어두운 테두리는 잘라내고 가운데 종이 부분만
  backgroundSize: "230% 165%",
  backgroundPosition: "center",
}
