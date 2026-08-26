\# ENDED 세션 재접속 시 자동 정리 (backend)



\## 배경 (확정된 원인)

게임 종료(ENDED) 후 결과 페이지에서 새로고침(F5)하면:

새 소켓이 먼저 연결되어 onlineUsersRegistry가 새 socket.id로 갱신되고, 옛 소켓의 disconnect가

나중에 도착한다. onDisconnect의 isCurrentSocketForUuid 가드가 이를 stale로 보고 return하므로

endGameSessionForPlayer가 호출되지 않아 playerSession에 uuid가 잔존한다. 이어서

resyncSessionRouting이 getActiveSessionRoutingInfo로 ENDED 세션에 재부착한다. 이후 새 방에서

게임을 시작하면 commitGameSession의 "참가자가 이미 다른 GameSession에 속함" 검증에 걸려 거부된다.

isCurrentSocketForUuid 가드 자체는 ABA 방지용 정상 설계이므로 건드리지 않는다.

이번 작업은 backend만 다룬다. frontend는 수정하지 않는다.



\## 요구사항

1\. getActiveSessionRoutingInfo가 phase를 함께 반환한다 (기존 반환 { gameId, channelId }에 추가).

2\. resyncSessionRouting(연결 시 호출)에서 라우팅 대상 세션의 phase가 'ENDED'이면 재부착(join)

&#x20;  대신 endGameSessionForPlayer(uuid, 'RECONNECT\_AFTER\_END', gameId)를 호출해 그 참가자를

&#x20;  정리한다. result.sessionDeleted가 true면 handleLeaveGameSession과 동일하게

&#x20;  finalizeGameSessionEnd를 수행한다. 진행 중(비-ENDED) 세션은 기존대로 재부착한다.

3\. onDisconnect / handleLeaveGameSession / endGameSessionForPlayer의 기존 계약은 변경하지 않는다.



\## 수정 금지

\- frontend/\*\* 전체

\- isCurrentSocketForUuid, onDisconnect의 가드 로직

\- 게임 판정/phase 전이 로직



\## 검증

\- 시나리오 테스트: ENDED 세션 + playerSession 잔존 상태에서 resyncSessionRouting 호출 →

&#x20; playerSession에서 uuid 제거, 마지막 참가자면 gameSessions/roomGameSession도 제거,

&#x20; 이후 commitGameSession으로 같은 uuid의 새 세션 커밋이 성공한다

\- 진행 중 세션 재접속 → 기존대로 channel join, registry 무변경

\- 활성 세션 없는 uuid → no-op

\- 기존 backend 전체 테스트 PASS

