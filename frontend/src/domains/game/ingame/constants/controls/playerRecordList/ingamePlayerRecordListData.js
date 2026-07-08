/**
 * 플레이어별 전적목록 더미 데이터·포맷 유틸.
 *
 * PlayerRecordListContent·PlayerRecordListRow에서 사용합니다.
 */
import { pickInGameJobPortrait } from "../../../utils/pickInGameJobPortrait.js"

/** prototype 플레이어별 전적목록 탭.png — 더미 전적 (초상은 pickInGameJobPortrait — jobs-closeup) */
const DUMMY_PLAYER_RECORDS_BASE = [
  {
    id: "player-1",
    name: "플레이어 1",
    wins: 62,
    losses: 18,
    winRate: 77.5,
    title: "전장의 지휘관",
  },
  {
    id: "player-2",
    name: "플레이어 2",
    wins: 60,
    losses: 22,
    winRate: 73.2,
    title: "죽음의 그림자",
  },
  {
    id: "player-3",
    name: "플레이어 3",
    wins: 70,
    losses: 30,
    winRate: 70.0,
    title: "빛의 수호자",
  },
  {
    id: "player-4",
    name: "플레이어 4",
    wins: 29,
    losses: 11,
    winRate: 72.5,
    title: "전략의 대가",
  },
  {
    id: "player-5",
    name: "플레이어 5",
    wins: 80,
    losses: 25,
    winRate: 76.2,
    title: "광기의 웃음",
  },
  {
    id: "player-6",
    name: "플레이어 6",
    wins: 45,
    losses: 20,
    winRate: 69.2,
    title: "은밀한 책략가",
  },
  {
    id: "player-7",
    name: "플레이어 7",
    wins: 55,
    losses: 17,
    winRate: 76.4,
    title: "혼돈의 서커스",
  },
  {
    id: "player-8",
    name: "플레이어 8",
    wins: 65,
    losses: 26,
    winRate: 71.4,
    title: "바람의 속삭임",
  },
  {
    id: "player-9",
    name: "플레이어 9",
    wins: 58,
    losses: 19,
    winRate: 75.3,
    title: "어둠의 연금술사",
  },
  {
    id: "player-10",
    name: "플레이어 10",
    wins: 52,
    losses: 24,
    winRate: 68.4,
    title: "밤의 사냥꾼",
  },
]

export const DUMMY_PLAYER_RECORDS = DUMMY_PLAYER_RECORDS_BASE.map(
  (record, index) => ({
    ...record,
    portraitSrc: pickInGameJobPortrait(index),
  }),
)

/** 승/패/승률을 목록 행에 표시할 한 줄 텍스트로 포맷 */
export function formatPlayerRecordStats({ wins, losses, winRate }) {
  return `${wins}승 ${losses}패 | ${winRate.toFixed(1)}%`
}
