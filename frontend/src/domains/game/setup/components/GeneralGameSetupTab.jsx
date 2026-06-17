/**
 * 인게임 설정 "일반" 탭 본문
 * GENERAL_GAME_SETUP 항목을 SetupTabContent에 넘김
 */
import { GENERAL_GAME_SETUP } from "../constants/gameSetupAssets.js"
import SetupTabContent from "./SetupTabContent.jsx"

/** 일반 탭 설정 목록(비공개 로비·최대 인원·광대 수 등) */
export default function GeneralGameSetupTab() {
  return <SetupTabContent items={GENERAL_GAME_SETUP} />
}
