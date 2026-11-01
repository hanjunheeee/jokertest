// 결과 화면 참가자 정체 목록: 틀 그림·제목·이긴 진영 배지·참가자 줄
// board/ResultBoard가 씀, 줄이 많으면 페이지가 같이 스크롤함 (데스크톱 안쪽 스크롤바 대신)
import { resolvePlayerListFrame } from "@/domains/game/result/constants/gameResultAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import PlayerRow from "./PlayerRow.jsx"
import WinningTeamBadge from "./WinningTeamBadge.jsx"

const SHADOW_CLASS =
    "[filter:drop-shadow(0_8px_18px_rgba(0,0,0,0.82))]"

// 참가자 정체 목록 (틀 그림은 승패 따라 바뀜, 늘여서 깖)
export default function PlayerList({ outcome = "win", winningTeam = null, players = [], selfUuid = null }) {
    return (
        <section className="relative w-full" aria-label="가면무도회 참가자 정체">
            <PublicAsset
                src={resolvePlayerListFrame(outcome)}
                alt=""
                aria-hidden="true"
                className={`pointer-events-none absolute inset-0 h-full w-full select-none object-fill ${SHADOW_CLASS}`}
            />
            <div className="relative px-[7%] pt-6 pb-7">
                <h2 className="mb-2 text-center font-display text-[1.45rem] font-medium leading-tight text-[#f5e8c8] [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]">
                    가면무도회 참가자 정체
                </h2>
                <WinningTeamBadge winningTeam={winningTeam} />
                <ul className="flex flex-col gap-1.5">
                    {/* 내 줄은 isSelf로 따로 표시 */}
                    {players.map((player, index) => (
                        <PlayerRow
                            key={player.id ?? `row-${index}`}
                            {...player}
                            isSelf={Boolean(selfUuid && player.id === selfUuid)}
                        />
                    ))}
                </ul>
            </div>
        </section>
    )
}
