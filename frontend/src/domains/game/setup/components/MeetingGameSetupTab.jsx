/**
 * 인게임 설정 "회의&투표" 탭 본문
 * MEETING_GAME_SETUP 항목을 SetupTabContent에 넘김
 */
import { MEETING_GAME_SETUP } from "../constants/gameSetupAssets.js"
import SetupTabContent from "./SetupTabContent.jsx"

/** 회의&투표 탭 설정 목록(토론·투표·밤 행동 시간·투표 공개 등) */
export default function MeetingGameSetupTab() {
  return <SetupTabContent items={MEETING_GAME_SETUP} />
}
