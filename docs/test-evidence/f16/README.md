# F16 검증 기록

2026-09-12 운영자 검증. 구현 기준 86b88c15 위에 Chrome 재현 결함과 계약 테스트 누락을 수정했다. 최종 전체 테스트와 독립 심사는 Pluto VERIFY의 최종 HEAD 결과를 기준으로 판단한다.

## 실제 외부 Chrome

- production UI/runtime fixture에서 나가기 버튼 1회에 일반 클릭+취소 두 사건이 발생했다. Chrome은 capture와 React callback 사이에 microtask를 실행해 예약 취소 설계를 깨뜨린다. 실제 DOM explicit owner로 수정 후 나가기/생성 뒤로가기 각각 취소 사건 1건. browser/production-ui-before-fix.json 및 after-fix 두 파일. fixture는 native 확인창 취소 이후 콜백을 재현하며 확인창 자체 검증이 아니다.
- 실제 앱 http://127.0.0.1:5183에서 QA API 4183, 격리 DB pluto_f01_20260909_al로 정상 로그인·로비·설정 이동.
- Master 1 / SFX 0 / 효과음 음소거 true를 UI로 변경한 뒤 전체 페이지를 다시 열어 복원 확인. 초기화 후 Master 100 / SFX 80 / 음소거 false. browser/settings-{changed,restored,reset}.json.
- 6인 방을 Chrome UI로 생성하고 정상 소켓 참가 테스트 계정 5명과 전원 준비한 후 게임 시작. 실제 역할 공개 확인·DAY 토론→투표 전환·인게임 설정 열기·효과음 음소거 true 변경·낮 투표 제출 및 화면 반영 확인. browser/game-ready.json, ingame-sound.json, game-vote-muted.json.
- 표시된 미디어의 muted/volume 상태는 settings-reset/ingame-sound에 DOM 관찰값으로 기록했다. 로그인·로비 공통 BGM 제어는 disabled/volume0으로 관찰했다. 설정의 배경음 슬라이더 값 80은 BGM 재생 허용을 뜻하지 않는다. 기존 6개 영상 muted 보존은 코드/회귀검사와 구분한다.
- 실제 게임 나가기 버튼에서 native confirm이 뜬 것을 확인했으나 Chrome 제어 도구의 dismiss 호출이 timeout했다. 브라우저에서 취소 후 잔류/승인 후 이탈을 끝까지 확인했다고 주장하지 않는다. 그 계약은 실제 createExitConfirmController 회귀 테스트로 확인했다.
- QA 참가자와 API는 최종 DB 검사 전에 종료했다. 운영 DB나 스키마는 쓰지 않았다.

## 실행 검증과 한계

- 운영자 전체 frontend: 1646 tests/pass, fail0/skip0. build PASS.
- UI/runtime/loader 집중56개 및 실제 소비 훅3개 PASS. 개인정보 수신자, 중복 사건, 탈락 terminal·stale roster·부활 거부를 실제 훅으로 확인했다. 합산 중복 집계는 하지 않는다.
- 첫 전체 backend는 600초에서 timeout, 응답 sfxEvent 추가에 대한 기대값 갱신 누락 4건. 정확한 envelope 키·ID·계정 검증으로 수정하고 비밀정보 금지 검사는 그대로 유지했다. 소켓188개 PASS, 마지막 격리 DB 파일13개 PASS/정상 종료. 개별 테스트 실행 합571.3초와 준비·정리 비용을 근거로 wrapper 제한만900초로 확장했다. 전체 최종 backend PASS는 공식 VERIFY 결과가 있어야 한다.
- 자산 파일·이용 조건은 아직 미제공이다. 실제 배포 manifest는 needs_assets_and_usage_review로 무음과 사유를 남긴다. mock fixture 성공은 실제 자산 승인/청음이 아니다.
- 로드·play 거절·영구 대기·watchdog 및 Master×SFX 적용은 실제 공통 재생기와 주입 fixture의 자동 테스트로 검증했다. 실제 Chrome에서 모든 브라우저 자동재생 실패를 강제했다는 주장은 하지 않는다.
- F17 신규 알림, F19 실제 초대, F27 전체 능력 영상/MOV5 내장음, F28 통합 검증은 담당 작업의 미완료로 남는다. F15 전체화면은 사용자 직접 검증 예외를 그대로 유지한다.

## 독립 심사 1회 후 보정

- 미검토 자산 검사를 mute/알림 설정보다 먼저 수행한다. 실제 Chrome production runtime에서 mute=true와 asset-unreviewed가 함께 기록됨을 확인했다(browser/muted-unreviewed-after-review.json).
- 볼륨/mute 적용 실패 시 play를 호출하지 않으며 재생 중 실패 시 pause·정리한다. 타이머 설치 실패도 즉시 실패 완료한다.
- 내장음 claim은 매체 하나만 소유하며 범위 변경·release·dispose 이후 attach를 거부하고 기존 매체를 멈춘다.
- 소켓 envelope의 restore 출처를 소비자가 live로 덮어쓰지 않는다. 실제 개인 결과 소비 훅에서 restore 거부 뒤 같은 live ID가 처리되는 회귀를 추가했다.
- 변경 없는 장착/프로필 확인은 효과음을 만들지 않는다. 변경 및 저장 잠금 검사를 통과한 입력에서만 onChanged를 호출한다.
- 보정 후 관련 실제 소비·UI·재생기 회귀 104/104 PASS, fail0/skip0. 이는 전체 재검증을 대체하지 않으며 최종 공식 VERIFY 및 두 독립 심사 결과를 기다린다.
- 이전 공식 npm ci의 EPERM은 검증용 Vite가 네이티브 모듈을 점유한 상태에서 설치를 실행한 운영 순서 오류였다. QA 서버를 종료한 재설치가 성공했고 이번 재검증 전에도 종료했다. 이전 실패 기록은 보존했다.

## 두 번째 독립 심사 후 실제 Chrome 실패·복원 보강

2026-09-12 22시대 검증. production 코드 기준 c73fcd6a에서 코드 수정 없이 실제 App/정상 QA API/정상 소켓 6인 게임을 사용했다. 아래 기록은 위의 최초 제한된 Chrome 검증을 보강한다. 최종 문서 커밋의 production 코드 해시는 c73fcd6a와 동일하다.

- 공식 VERIFY-2~6: 두 npm ci, frontend 1655/1655, build, 격리 backend 1503/1503 전부 exit0/fail0/skip0. backend 589.248초. 이후 문서 증거만 추가했으며 마지막 정상 VERIFY 결과를 최종 판정 기준으로 삼는다.
- 시험 도구 source: browser/live-fault-probe.js. production createSfxPlayer/createSfxAssetLoader와 실제 App의 기존 이벤트 소비자를 사용한다. 배포 manifest는 바꾸지 않았다. 로컬 저작 시험 바이트에 대한 시험용 manifest를 __setSfxPlayerForTests로 연결하고 독립 observer가 사건·완료를 기록했다. 게임 state/setState를 주입하거나 서버 이벤트를 꾸며내지 않았다. 게임 참가자는 정상 HTTP 로그인과 Socket.IO 명령으로만 참가했다.
- **실제 HTTP 404**: live-http404-navigation.json. 실제 fetch 응답404 → asset-load-failed/failed, 매체0. 실제 설정 화면 이동 완료. live-login-hash-failure.json은 최초 URL이 Vite fallback200을 반환해 실제 바이트 해시 불일치로 실패했지만 로그인은 완료된 별도 기록이다. 이 최초 기록을 HTTP404로 주장하지 않는다.
- **실제 브라우저 미디어 실패**: live-media-error-navigation.json. 검증된 시험 바이트를 실제 Audio로 넘겨 HTMLMediaElement 오류4가 발생하고 failed로 정착. 실제 설정 화면 이동 완료. 유효한 효과음 자산의 청음 검증은 아니다.
- **자동재생 거절 경계**: live-autoplay-denial-navigation.json. 실제 Chrome 안의 production player에서 매체 adapter의 play가 NotAllowedError를 거절하도록 명시 주입했다. play-rejected/failed 기록과 실제 사운드 탭 활성화가 함께 보인다. Chrome 정책이 자연 발생했다고 주장하지 않는다.
- **영구 대기**: live-load-pending-navigation.json과 live-play-pending-navigation.json. loader/play의 미정착 Promise만 시험 도구에서 주입했다. 실제 Chrome 타이머가 각각 약3초/1.4초 뒤 timed-out으로 정착했고, 실제 로비/방 목록 화면은 이미 이동했다. 가짜 시계나 가짜 App/게임 핸들러가 아니다.
- **실제 게임 진행**: live-game-start-http-failure.json. Chrome UI로 실제 6인 방 생성·준비·게임시작·역할확인을 진행했다. ready/game-started/game-phase-changed에 실제404 실패가 나도 DAY 게임으로 진입했다. live-night-timer-load-pending.json은 이후 실제 DOCTOR 턴 사건이 timed-out으로 끝나는 동안 밤 타이머가83초→51초로 진행되는 것을 확인한 기록이다. 밤 종료 버튼 요청은 서버가 거절했으므로 강제 밤 종료 성공으로 기록하지 않는다. 게임 규칙을 우회하지 않았다.
- **실제 재접속과 서버 복원**: live-game-reconnect-http-failure.json은 실제 socket.disconnect/connect 후 기존 createSelfDisconnectHandler가 게임을 정리해 /multiplay로 이동하는 동작을 기록한다. 자동 잔류/자동 게임복원을 주장하지 않는다. 이후 정상 /ingame 재진입에서 기존 useInGameSessionSnapshotSync가 실제 get_session_snapshot ACK로 동일 gameId 85fbe4fe-4c24-4407-8798-8d3c2d6d3239를 복원했다. live-game-server-snapshot-restored.json에서 snapshotSeq=2, NIGHT, connected=true, /ingame, 기본 production runtime silence=[]를 확인했다. 복원된 게임 상태를 직접 주입하지 않았으며 복원으로 SFX가 재발행되지 않았다.
- 보상/승패를 포함한 모든 기존 업무 조합을 Chrome에서 오류별로 각각 실행했다는 주장은 하지 않는다. 해당 업무 계약은 전체 실제 frontend/backend 회귀와 함께 판정한다. F17/F19/F27 연결 및 F28 통합은 여전히 미완료다.
- QA API·참가자·Vite를 종료하고 frontend/index.html을 바이트 단위 원복했다. 임시 실행 파일은 frontend에서 제거하고 증거용 source만 docs에 보존했다. 다음 npm ci와 DB 검사는 QA 프로세스가 없는 상태에서 수행한다.

### AC04 분할 심사 근거 누락에 대한 원문

origin-closure-proof.json은 c73fcd6a 실제 파일의 SHA256·줄 번호·원문이다. useSfxRuntime.js:281 handleAchievementGranted는 origin: envelope.origin을 그대로 전달한다. useGameSessionSocketEvents.js:47 playGameSfx는 인자로 받은 origin을 그대로 dispatch하며 :150 handleNightActionResult는 envelope.origin ?? "restore"를 넘긴다. sfxConsumer.test.js:236 실제 훅 회귀는 restore 사건이 자산 로드 경계에 도달하지 않고 같은 ID의 live가 최초 처리되는 것을 검증한다. 이 자료는 원하는 판정을 강제하는 문장이 아니라 원문 대조 근거다.
