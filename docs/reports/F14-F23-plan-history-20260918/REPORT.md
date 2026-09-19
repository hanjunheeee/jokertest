# F14~F23 계획 기록 보고서

작성·집계 기준: 2026-09-18 20:11:18 KST · 프로젝트: jokertest · 보존 원본 기준

## 1. 전체 요약

F14부터 F23까지 10개 작업의 계획 생성·탐색 기록 **121건**과 별도 독립 계획 심사 기록 **12건**, 합계 **133건**을 확인했다. F14~F21 8개 작업은 현재 상태 파일에 완료·병합으로 기록돼 있고, F22는 사용자 취소, F23은 반복 계획 반려로 사람 판단 단계에 멈춰 있다.

이 보고서는 **무엇을 만들기로 계획했고, 계획이 어떻게 바뀌었으며, 어떤 이유로 막혔는지**를 정리한다. 제품·DB·브라우저 검증을 새로 수행한 보고서는 아니다. F22 취소 이후 전체 배치는 완료 21 / 유효 31개다.

| 작업 | 슬라이스 | PLAN 기록 | 독립 계획 심사 | 호출 실패¹ | 호출 소요 합계² | 현재 상태 |
|---|---|---:|---:|---:|---:|---|
| F14 구매 스킨·카드 장착 | AY | 8 | 2 | 0 | 15.7분 | 완료·병합 |
| F15 통합 일반·채팅 설정 | AZ | 4 | 1 | 0 | 5.4분 | 완료·병합 |
| F16 효과음 전체·사운드 설정·금지 음악 무음 유지 | BA | 18 | 2 | 1 | 57.0분 | 완료·병합 |
| F17 알림 모달·읽음·발생 이벤트 | BB | 18 | 1 | 1 | 64.1분 | 완료·병합 |
| F18 로비 프로필·Discord 고객센터·명예의 전당 진입 제거 | BC | 7 | 2 | 0 | 22.3분 | 완료·병합 |
| F19 친구창 보완·차단/해제·대기방 친구 UI·실제 초대 | BD | 23 | 1 | 0 | 87.5분 | 완료·병합 |
| F20 대기방 설정 변경 | BE | 12 | 2 | 0 | 45.1분 | 완료·병합 |
| F21 방장 추방 | BF | 11 | 1 | 0 | 47.7분 | 완료·병합 |
| F22 강제 종료·종료 정리 | BG | 7 | 0 | 0 | 24.9분 | 사용자 취소 |
| F23 관전자 설정·입장·권한 전면 제거 | BH | 13 | 0 | 1 | 44.9분 | PLAN human |

¹ 호출 실패는 원본 기록의 `ok=false`만 집계했다. 계획 반려·시험 실패와 다르다. ² `durationMs` 합계로, 도구 대기 등을 포함한 호출 경과시간이다. 순수 모델 계산시간·슬라이스 전체 시간·사용량 과금 시간으로 해석하지 않는다.

## 2. 기록을 읽는 기준

- `PLAN-N`은 후보 확장, 코드 본문 확인, 최종 계획안을 모두 포함한다. **121건을 121회 반려 또는 121개 완성된 계획으로 세면 안 된다.**
- `retry`는 계획뿐 아니라 구현·검증·인프라 복구를 포함한다. 예를 들어 F19의 현재 retry 15를 계획 반려 15회로 해석하지 않는다.
- `ok=true`는 실행 응답 성공이고 `readiness.ready=true`는 구현 준비 판단이다. 어느 쪽도 제품 시험·실제 UI PASS를 뜻하지 않는다.
- `CLAUDE-PLAN-N`의 PASS는 **계획**의 독립 심사 결과다. 이후 코드 심사와 공식 전체 검증은 별도다.
- 엔진 로그의 “Claude 계획 반려” 문구만으로 별도 Claude 호출을 단정하지 않는다. 특히 F22/F23에는 독립 `CLAUDE-PLAN` 파일이 없으며, 마지막 PLAN 응답 자체에 readiness=false가 있다.
- 현재 state.plan에는 과거의 가정·미확인 메모가 누적될 수 있다. 완료 작업에 남은 `untested`나 오래된 unsure를 현재 결함으로 단정하지 않는다.
- 일부 상태 로그는 최근 항목만 보존한다. 로그에 반려가 없다는 사실만으로 과거 반려가 없었다고 단정하지 않는다. 모든 회차의 원본 링크는 부록에 남겼다.
- F19의 PLAN-7은 ok=true지만 보존된 응답을 완전한 JSON으로 해석할 수 없다. 부록에 “판정 추출 불가”로 표시하고 원문은 수정하지 않았다. 호출 실패 3건 집계와도 별도로 구분한다.
- F22는 삭제 전 보관본으로 집계했다. 아래 기록·계획은 취소된 기능을 재개할 지시가 아니다.

## 3. 주요 계획 변경

| 변경 | 확인된 내용 | 후속 작업에 남는 조건 |
|---|---|---|
| F16 효과음 범위 분리 | 현재 공통 기반과 현존 사건 연결로 범위를 나누고 미래 생산자를 분리 | F17 알림, F19 초대, F27 능력 영상, F28 통합 확인 |
| F17 알림음 이관 반영 | 원래 6AC에 SFX-DEFER-17을 AC-07로 추가 | 조회·복원과 신규 사건 구분, 무음·계정 경계 유지 |
| F18 제거와 보존 구분 | 로비 진입은 제거하되 podium 소스·자산·서고 기능 보존 | 기존 동작을 고정한 라우트/메뉴 시험도 계약 변경 |
| F20 설정 복원 책임 분리 | 현재 방 생성/편집 경로 검증과 다음 방 실제 복원 검증 분리 | F24 RESTORE-24 / F28 RESTORE-INTEGRATION-28 유지 |
| F22 사용자 취소 | 강제 종료 기능 불필요 지시로 항목 취소, 미연결 UI 삭제 | 재등록 금지, 정상 종료·추방 기능 유지 |
| F23 반복 계획 정지 | 후속 책임 경계·실제 수신/복구 연결·후보 목록 대응 미확정 | 미해결 항목을 줄이지 않고 정상 계획 보완 필요 |

## 4. 작업별 계획과 변경 경과

### F14 · 구매 스킨·카드 장착 (AY)

**현재 상태:** 완료·병합. 계획 기록 8건 / 별도 독립 계획 심사 2건. 상태 파일의 전체 단계 retry=5.
**기록 구간:** 2026-09-12 03:06:44 ~ 2026-09-12 03:57:50 KST (각 호출의 기록 시각).
**계획 목표:** 구매한 직업 스킨·카드를 서버 소유권에 따라 장착하고, 게임 시작·재접속 화면까지 정확한 외형을 전달한다.

- 프런트 전용 장착 상태에서 서버 카탈로그·소유권·슬롯별 저장·재로그인 복원으로 계획을 확장했다.
- F13의 revision 기반 충돌 방지, 계정 전환·지연 응답·부분 성공 처리를 보존했다.
- 게임 세션 생성 → 시작/복원 응답 → 화면 렌더 연결과 수신자별 직업 비밀 보호를 계획에 포함했다.

**주요 쟁점:** 저장만 하는 기능으로 끝내지 않고 실제 게임의 생산자·수신자·렌더까지 연결해야 했다. 계획 기록에는 후보 코드 ID와 실제 기준본 불일치도 미확인 사항으로 남아 있다.

**해석·미검증 경계:** 계획의 untested 표시는 설계 당시의 가정이다. 이후 완료 상태와 혼동해 현재 제품이 미구현이라고 해석하지 않는다.

**현재 저장된 성공조건**

| ID | 확인 방식 | 조건 |
|---|---|---|
| AC-01 | test | 구매(소유)한 직업 스킨·플레이어 카드를 착용 UI에서 선택·저장하면 서버에 반영되고 재로그인 후에도 동일하게 복원된다. |
| AC-02 | test | 미보유 스킨·카드를 장착 요청하면 서버가 거부하고 장착 상태가 변경되지 않는다. |
| AC-03 | test | 계정을 전환하면 이전 계정의 소유품·장착 캐시가 초기화되고 새 계정의 소유품·장착 상태만 표시된다. |
| AC-04 | test | 직업 전용 외형(스킨)이 적용된 인게임 화면에서 역할이 숨겨진 수신자에게는 해당 역할 정보가 노출되지 않는다. |
| AC-05 | manual | 장착 저장 요청은 정상·로딩·실패·재시도 상태를 모두 화면에서 확인할 수 있고 성공하지 않은 경우 완료 토스트가 뜨지 않는다. |
| AC-06 | build | 장착 관련 신규 API·소켓 동작에 대한 자동 테스트와 프론트 상태/훅 테스트, production build가 통과한다. |

**계획 심사·준비 판단 근거**

- 2026-09-12 03:11:32 · [CLAUDE-PLAN-1.json](<C:/Users/minsa/jokertest/.pluto/slices/AY/runs/CLAUDE-PLAN-1.json>) · PASS: All six selected entities exist in the working tree exactly as described (equipItem at backend/service/economy.service.js:651 with catalog+ownership rejection ITEM_NOT_OWNED, skinCardWear.store.js with applyLoadout/reset and a frontend-only comment, useSkinCardWearSelection with draftSkinsByJob/draftCardFrameId, SkinCardWearOverlay, and buildGameStartedPayload/buildSessionSnapshot in backend/game-core/gameSession.js splitting public players from viewer-scoped self via buildViewerRoleFields), every AC is covered by …
- 2026-09-12 03:57:50 · [CLAUDE-PLAN-2.json](<C:/Users/minsa/jokertest/.pluto/slices/AY/runs/CLAUDE-PLAN-2.json>) · PASS: All six acceptance criteria are covered by verified existing entities, the plan's factual claims match the current tree (frontend-only skinCardWear store, no accountSkinsByJob in backend, migrations ending at 0010, no per-job skin loadout columns), and it fabricates no new entities while preserving DB-isolation, role-secrecy, and F-13 CAS contracts.
- 마지막 구조화 계획안: [PLAN-8.json](<C:/Users/minsa/jokertest/.pluto/slices/AY/runs/PLAN-8.json>) · 준비 판정 필드 없음.
- 현재 상태에 기록된 병합 커밋: `f5682a1f0d4b7c7853d777d150a9c2067fd5286c`.

원본: [상태·저장 계획](<C:/Users/minsa/jokertest/.pluto/slices/AY/state.json>) · [회차별 기록 폴더](<C:/Users/minsa/jokertest/.pluto/slices/AY/runs>)

### F15 · 통합 일반·채팅 설정 (AZ)

**현재 상태:** 완료·병합. 계획 기록 4건 / 별도 독립 계획 심사 1건. 상태 파일의 전체 단계 retry=7.
**기록 구간:** 2026-09-12 09:22:11 ~ 2026-09-12 09:26:44 KST (각 호출의 기록 시각).
**계획 목표:** 일반·채팅 설정을 실제 UI와 공용 설정 저장소에 연결하고 기기 로컬 저장을 유지한다.

- 귓속말 알림만 제거하고 친구·게임 초대·시스템 알림 설정을 유지했다.
- 텍스트 크기·채팅 글자 크기·시간·닉네임 색상·도움말·초기화를 실제 소비 화면에 연결했다.
- 전체화면은 저장 선호값 대신 실제 브라우저 상태를 따르며 직업 비밀과 BGM 차단을 보존하도록 했다.

**주요 쟁점:** 여러 화면의 로컬 상태를 공유 설정에 연결하고 실제 전체화면과 UI 상태를 동기화하는 것이 주요 설계 내용이었다.

**해석·미검증 경계:** 실제 Chrome 전체화면 진입·Escape 확인은 사용자 담당으로 이관된 미검증 항목이다. 현재 성공조건에도 명시돼 있어 자동 시험 PASS로 대체하지 않는다.

**현재 저장된 성공조건**

| ID | 확인 방식 | 조건 |
|---|---|---|
| AC-01 | manual | 설정 화면에서 귓속말 알림 항목이 제거되고 친구 초대·게임 초대·시스템 알림 설정은 그대로 남아 있다. |
| AC-02 | manual | 설정 화면의 텍스트 크기·채팅 글자 크기·시간 표시·닉네임 색상·도움말 다시 보기·초기화 항목이 실제 화면 동작에 반영된다. 전체화면 실제 검증은 사용자 승인에 따라 사용자 담당·미검증으로 별도 보존한다. |
| AC-03 | test | 전체화면 요청 성공·실패·외부 해제에 따른 설정 UI 동기화 회귀 테스트가 통과한다. 실제 Chrome 전체화면 진입·Escape 검증은 사용자가 직접 담당하도록 명시적으로 이관했으며 미검증이다. 자동 테스트 통과를 실제 전체화면 검증 PASS로 주장하지 않는다. |
| AC-04 | manual | 채팅 닉네임 색상 적용 시 비밀 진영이나 직업 정보가 노출되지 않는다. |
| AC-05 | manual | 설정 초기화 또는 페이지 전환 후에도 재생 중이던 음악이 다시 재생되지 않고 무음 상태가 유지된다. |
| AC-06 | manual | 환경설정 변경 후 새로고침해도 기기 로컬 저장에 따라 설정값이 유지된다. |

**계획 심사·준비 판단 근거**

- 2026-09-12 09:26:44 · [CLAUDE-PLAN-1.json](<C:/Users/minsa/jokertest/.pluto/slices/AZ/runs/CLAUDE-PLAN-1.json>) · PASS: All selected entities exist in the current tree with the claimed behaviors, every acceptance criterion is mapped to a sensible connection point, and the plan's assumptions and unsure entries accurately reflect what remains to be verified.
- 마지막 구조화 계획안: [PLAN-4.json](<C:/Users/minsa/jokertest/.pluto/slices/AZ/runs/PLAN-4.json>) · 준비 판정 필드 없음.
- 현재 상태에 기록된 병합 커밋: `27a9de3c977c41eb7b499a06859afb42e66eccde`.

원본: [상태·저장 계획](<C:/Users/minsa/jokertest/.pluto/slices/AZ/state.json>) · [회차별 기록 폴더](<C:/Users/minsa/jokertest/.pluto/slices/AZ/runs>)

### F16 · 효과음 전체·사운드 설정·금지 음악 무음 유지 (BA)

**현재 상태:** 완료·병합. 계획 기록 18건 / 별도 독립 계획 심사 2건. 상태 파일의 전체 단계 retry=6.
**기록 구간:** 2026-09-12 17:49:24 ~ 2026-09-12 19:17:18 KST (각 호출의 기록 시각).
**계획 목표:** 공통 효과음 재생·볼륨·음소거·중복 억제를 만들고 현재 존재하는 사건에 연결한다.

- 초기에는 미래 알림·실제 게임 초대·능력 영상까지 함께 요구돼 생산자·소비처가 없는 부분이 계획을 막았다.
- 사용자 승인으로 현재 공통 기반은 F16, 시스템 알림은 F17, 실제 초대는 F19, 능력 영상 동기는 F27로 분리하고 F28 통합 확인을 남겼다.
- UI 클릭/확인/취소별 단일 재생 책임, 사건 ID와 계정 경계, 복원 시 재생 억제, 재생 실패 격리를 정리했다.
- 로그에는 독립 계획 심사 통과 설계의 필수 37개 파일을 공식 File ID에 대응한 보정이 기록돼 있다.

**주요 쟁점:** 미래 기능을 현재 슬라이스에서 요구한 범위 문제와 실제 소비처·후보 ID 누락이 함께 나타났다. 독립 Claude 계획 호출의 연결 거부도 별도 기록돼 있다.

**해석·미검증 경계:** 미확인 자산은 무음이다. 승인된 MOV 내장음과 F27 연결, 실제 청음 여부는 각각 구분해야 한다.

**현재 저장된 성공조건**

| ID | 확인 방식 | 조건 |
|---|---|---|
| AC-01 | manual | 공통 SFX 재생 기반과 현재 구현된 버튼 클릭/확인/취소·친구 요청·업적 보상·준비/게임 시작/턴 전환/투표/결과 등 실제 사건을 조사해 연결하고 생산자→사건 ID→수신자→소비처 목록을 남긴다. 신규 시스템 알림 연결은 F17, 실제 게임 초대는 F19, 전체 개인 능력 영상 동기는 F27에 이관하며 현재 미완료로 추적하고 F28에서 통합 검증한다. 미래 기능 자체를 F16에서 구현하거나 미연결을 완료로 판정하지 않는다. |
| AC-02 | manual | 출처·이용 조건이 확인된 효과음만 재생하고 미확인 자산은 무음과 사유를 기록한다. 공통 manifest/허용 검사 계약을 검증하며 mock 테스트나 무음을 실제 청음 완료로 주장하지 않는다. |
| AC-03 | manual | Master×SFX 볼륨·효과음 음소거가 기기 로컬 저장에 따라 새로고침 후 복원되고 초기화는 정해진 기본값으로 돌아간다. 어떤 설정 조작도 금지된 BGM을 재활성화하지 않는다. 후속 영상 내장음에도 사용할 공통 볼륨/mute API를 명시한다. |
| AC-04 | manual | F16에 연결한 동일 사건의 중복 전달·재렌더링·연타·재접속 복원에서 재생이 중복되지 않는다. 안정 사건 ID·대상 계정/게임·신규/복원 구분과 후속 알림/초대/영상용 공통 API를 문서화하고 계약 테스트로 검증한다. 미래 producer와의 실제 연결 검증은 해당 담당 작업에서 수행한다. |
| AC-05 | manual | 현재 연결하는 개인 사건은 서버가 허용한 수신자 외에 재생되지 않으며 기존 로그인/로비/설정/상점/승패/킬 영상6곳의 muted와 역할 정보 은닉을 보존한다. 사용자 승인 MOV5개 내장음·전체 개인 능력 영상의 실제 동기 연결은 F27 담당 미완료로 기록한다. F16은 이를 위한 Master×SFX/mute 및 중복음 방지 계약을 제공하고 F27/F28에서 실제 검증한다. |
| AC-06 | manual | F16 효과음 로드·재생 실패/자동재생 거절/영구 대기가 기존 게임 상태·타이머·보상·결과 화면 진행을 막지 않는다. 현재 사건의 회귀 테스트와 실제 Chrome 검증을 수행하고, 후속 F17/F19/F27 통합 검증을 완료로 복사하지 않는다. |

**계획 심사·준비 판단 근거**

- 2026-09-12 19:13:53 · [CLAUDE-PLAN-1.json](<C:/Users/minsa/jokertest/.pluto/slices/BA/runs/CLAUDE-PLAN-1.json>) · 호출 실패: API Error: Unable to connect to API (ConnectionRefused)
- 2026-09-12 19:17:18 · [CLAUDE-PLAN-2.json](<C:/Users/minsa/jokertest/.pluto/slices/BA/runs/CLAUDE-PLAN-2.json>) · PASS: All plan claims verified against the working tree — selected entities exist and behave as described (friend controller empty payload/byUuid at backend/controller/friend.controller.js:42-74, settings defaults master=100/sfx=80 via SOUND_SETTING_VOLUMES, MUSIC_PLAYBACK_ENABLED gating in useAudioControl, submitDayVote/tribunal contracts in backend/game-core/gameSession.js, socket.to player_ready_changed broadcast, all six video components muted), the backend-emitted player_eliminated at backend/socket/gameSession.js:9…
- 마지막 구조화 계획안: [PLAN-18.json](<C:/Users/minsa/jokertest/.pluto/slices/BA/runs/PLAN-18.json>) · 준비 미완료.
- 현재 상태에 기록된 병합 커밋: `2429286533edeeae233e4e7e81ad4c4f643f3c8d`.

원본: [상태·저장 계획](<C:/Users/minsa/jokertest/.pluto/slices/BA/state.json>) · [회차별 기록 폴더](<C:/Users/minsa/jokertest/.pluto/slices/BA/runs>)

### F17 · 알림 모달·읽음·발생 이벤트 (BB)

**현재 상태:** 완료·병합. 계획 기록 18건 / 별도 독립 계획 심사 1건. 상태 파일의 전체 단계 retry=7.
**기록 구간:** 2026-09-12 22:47:15 ~ 2026-09-13 00:03:01 KST (각 호출의 기록 시각).
**계획 목표:** 친구 요청·업적·시스템 사건을 영속 알림으로 연결하고 읽음·미확인 표시·설정·계정 경계를 관리한다.

- 서버 계정과 원본 사건 키를 중복 방지 기준으로 잡고 원본 사건과 알림 행을 같은 트랜잭션에서 확정하도록 했다.
- F16에서 넘긴 SFX-DEFER-17을 원래 6개 조건에 AC-07로 추가했다.
- 초기 조회·읽음·재접속 복원은 신규 알림음으로 취급하지 않고, 신규 live 사건만 한 번 처리하도록 했다.
- 계획 호출 시간 초과 기록을 실패로 보존하고 정상 재계획·독립 심사로 진행한 이력이 있다.

**주요 쟁점:** 시스템 알림의 실제 발생 지점과 F16 소비처 연결, 공식 성공조건에 이관 범위를 넣는 일이 주요 수정점이었다.

**해석·미검증 경계:** 시험용 재생 주입과 실제 허용 자산 청음은 별개다. 계획 통과는 이후 읽음·복원·실제 UI 검증을 대신하지 않는다.

**현재 저장된 성공조건**

| ID | 확인 방식 | 조건 |
|---|---|---|
| AC-01 | manual | 친구 요청, 업적/보상, 시스템 이벤트가 실제 발생 시 알림 목록에 나타나고 벨 아이콘 등 진입 버튼에 미확인 표시가 갱신된다. |
| AC-02 | test | 알림 항목을 열람하거나 대상으로 이동하면 읽음 처리되어 미확인 표시가 사라지고 재로그인 후에도 읽음 상태가 유지된다. |
| AC-03 | test | 동일한 사건에 대해 알림이 중복 생성되지 않는다. |
| AC-04 | test | 알림 설정에서 특정 알림을 꺼도 원본 친구 요청·초대·보상 데이터는 그대로 보존되고 목록 표시에만 반영된다. |
| AC-05 | manual | 계정 전환 또는 로그아웃 시 이전 계정의 알림 목록이 화면과 캐시에서 제거되고 새 계정의 알림만 표시된다. |
| AC-06 | manual | 알림 목록이 비어 있을 때 빈 상태 화면이, 조회 실패 시 실패·재시도 화면이 기존 모달 셸 리소스로 표시된다. |
| AC-07 | manual | SFX-DEFER-17: 새 시스템 알림의 실제 서버 생산·수신 경로를 F16 공통 SFX 재생기에 연결한다. 안정 알림 ID별 신규 발생은 한 번만 처리하고 조회·목록 복원·읽음·재접속은 재생0회이며 대상 계정 경계·계정 전환 cleanup·알림 off/mute를 지킨다. 미확인 자산은 무음과 사유를 유지하고 SFX 로드/재생 실패·영구 대기가 알림 읽음이나 화면 진행을 막지 않음을 실제 경로 테스트와 외부 Chrome에서 검증한다. 모의 재생을 실제 청음으로 주장하지 않으며 F28 통합 이관표에 증거를 기록한다. |

**계획 심사·준비 판단 근거**

- 2026-09-13 00:03:01 · [CLAUDE-PLAN-1.json](<C:/Users/minsa/jokertest/.pluto/slices/BB/runs/CLAUDE-PLAN-1.json>) · PASS: All selected entities, technical claims (restore-origin no-mark in sfxPlayer admit, non-transactional createFriendRequest, migration slot 0012, setting IDs, API client, model auto-loader), and absence of existing notification code were verified against the working tree; the 13 new entities are justified, all 7 ACs have concrete resolved designs, and unsure items are either ID bookkeeping or properly deferred verification gates, not unresolved implementation prerequisites.
- 마지막 구조화 계획안: [PLAN-18.json](<C:/Users/minsa/jokertest/.pluto/slices/BB/runs/PLAN-18.json>) · 준비 완료.
- 현재 상태에 기록된 병합 커밋: `11e95027f38bf4ed9f446dd1a354818d79cf4dfd`.

원본: [상태·저장 계획](<C:/Users/minsa/jokertest/.pluto/slices/BB/state.json>) · [회차별 기록 폴더](<C:/Users/minsa/jokertest/.pluto/slices/BB/runs>)

### F18 · 로비 프로필·Discord 고객센터·명예의 전당 진입 제거 (BC)

**현재 상태:** 완료·병합. 계획 기록 7건 / 별도 독립 계획 심사 2건. 상태 파일의 전체 단계 retry=4.
**기록 구간:** 2026-09-13 11:09:00 ~ 2026-09-13 11:30:16 KST (각 호출의 기록 시각).
**계획 목표:** 로비 프로필 편집을 기존 공용 편집기에 연결하고 중복 Discord 버튼 및 명예의 전당 진입을 제거한다.

- 오른쪽 큰 Discord 버튼을 제거하고 왼쪽 메뉴의 기존 버튼을 유지했다.
- 명예의 전당 진입은 없애되 podium 페이지·컴포넌트·이미지와 기억의 서고 통계·랭킹은 보존하도록 했다.
- 첫 독립 계획 심사에서 기존 라우트·메뉴 시험이 삭제 전 동작을 고정하고 있다는 지적을 받아 해당 시험의 변경 계약을 추가했다.

**주요 쟁점:** 제거 대상 코드만 계획하고 그 동작을 고정한 기존 시험을 빠뜨린 것이 명시적인 계획 반려 사유였다.

**해석·미검증 경계:** 실제 Discord 지원 URL은 당시 미제공이어서 실제 지원 링크 연결은 성공조건상 미검증으로 남는다. 임의 URL로 대체하지 않는다.

**현재 저장된 성공조건**

| ID | 확인 방식 | 조건 |
|---|---|---|
| AC-01 | manual | LobbyPage에서 독립적인 LobbyDiscordButton(로비 오른쪽 큰 Discord 버튼) 렌더링이 제거되어 화면에 보이지 않는다. |
| AC-02 | manual | 왼쪽 메뉴 목록 아래 기존 Discord 버튼은 유지되며 별도의 고객센터 버튼이나 페이지가 추가되지 않는다. |
| AC-03 | manual | 왼쪽 메뉴의 Discord 버튼 클릭 시 D-06에서 제공된 실제 Discord 지원 URL로 연결되는지는 discord_support_url이 미제공 상태이므로 검증되지 않은 항목으로 남는다. |
| AC-04 | manual | 로비의 프로필 수정 버튼을 클릭하면 마이페이지와 동일한 프로필 편집 모달이 열리고 저장 시 결과가 즉시 화면에 반영된다. |
| AC-05 | manual | 로비 메뉴에서 명예의 전당 버튼 및 해당 메뉴로의 이동 연결과 키보드 포커스·접근성 목록 항목이 제거되어 있다. |
| AC-06 | test | podium 관련 페이지·컴포넌트·이미지 소스는 삭제되지 않고 저장소에 보존되어 있으며 기억의 서고의 직업별 판수·승률·랭킹 기능은 계속 정상 동작한다. |

**계획 심사·준비 판단 근거**

- 2026-09-13 11:19:36 · [CLAUDE-PLAN-1.json](<C:/Users/minsa/jokertest/.pluto/slices/BC/runs/CLAUDE-PLAN-1.json>) · REJECT: The plan's repository claims are accurate, but it leaves two existing test files unaddressed that directly assert the behavior AC-05 removes, guaranteeing frontend regression failures with no planned disposition.
- 2026-09-13 11:30:16 · [CLAUDE-PLAN-2.json](<C:/Users/minsa/jokertest/.pluto/slices/BC/runs/CLAUDE-PLAN-2.json>) · PASS: Every repository claim in the plan (removal targets, kept menu button, resolver/env boundary, profile-edit save chain with expectedRevision, podium route and both locked test files' existing contracts, preservation and library ranking paths) was verified against the working tree, all six ACs are concretely covered including the mandated updates to podiumRoute.test.js and lobbyMenu.test.js, and the only open items are user-provided-URL verification and DB-availability gating that the plan correctly records as unveri…
- 마지막 구조화 계획안: [PLAN-7.json](<C:/Users/minsa/jokertest/.pluto/slices/BC/runs/PLAN-7.json>) · 준비 완료.
- 현재 상태에 기록된 병합 커밋: `ae40d975c292dbfaac4e084716b1ab8eb581f518`.

원본: [상태·저장 계획](<C:/Users/minsa/jokertest/.pluto/slices/BC/state.json>) · [회차별 기록 폴더](<C:/Users/minsa/jokertest/.pluto/slices/BC/runs>)

### F19 · 친구창 보완·차단/해제·대기방 친구 UI·실제 초대 (BD)

**현재 상태:** 완료·병합. 계획 기록 23건 / 별도 독립 계획 심사 1건. 상태 파일의 전체 단계 retry=15.
**기록 구간:** 2026-09-13 13:15:15 ~ 2026-09-13 15:00:23 KST (각 호출의 기록 시각).
**계획 목표:** 로비·대기방 친구 상태를 공유하고 즐겨찾기·차단·전체 수락·실제 게임 초대를 연결한다.

- 즐겨찾기는 계정별 서버 저장, 차단은 양방향 요청·초대 제한으로 정했다. 기존 친구 관계는 유지하고 미처리 요청/초대만 무효화한다.
- 초대 ID·수신자·방 인스턴스를 서버에서 결정하고 수락 시 정원·시작·삭제·차단을 다시 확인하도록 했다.
- SFX-DEFER-19를 실제 신규 초대 수신에 연결하고 조회·복원·재접속 재생은 억제한다.
- 초대 수락 결정·발행 영수증·현재 방 소속을 별도 사실로 구분하고 늦은 작업이 새 소속을 건드리지 않도록 계획했다.

**주요 쟁점:** 코드 지도 복구와 정상 재계획 이력이 있으며, 이후 retry 15에는 구현·DB 검증·심사 반려가 함께 포함된다. 계획 반려가 15회였다는 뜻은 아니다.

**해석·미검증 경계:** 기록에 당시 브라우저 방식 변경 이력이 남아 있다. 현재 후속 운영 규칙은 외부 Chrome만 사용한다. 본 보고서는 역사 기록을 다시 실행하지 않는다.

**현재 저장된 성공조건**

| ID | 확인 방식 | 조건 |
|---|---|---|
| AC-01 | manual | 게임 대기방에서 로비의 FriendListPanel(목록/추가/받은 요청 탭)을 재사용하여 로비와 대기방이 같은 계정의 친구·요청 상태를 표시한다 |
| AC-02 | test | 친구 전체 수락 시 요청별로 독립 처리되어 일부만 실패해도 서버에서 목록을 재조회하고 성공/실패가 구분되어 안내된다 |
| AC-03 | test | 즐겨찾기가 계정별 서버에 저장되어 재접속·다른 브라우저·계정 전환 후에도 정확히 복원되고 로그아웃 시 캐시가 초기화된다 |
| AC-04 | test | 실제 차단·차단 해제·차단 목록 조회가 동작하며 차단 관계에서는 서버가 친구 신청과 게임 초대를 양방향으로 거부한다 |
| AC-05 | test | 차단 시 기존 미처리 친구 요청/게임 초대가 무효화되고 차단 해제 후에도 자동으로 복원되지 않으며 기존 친구 관계 자체는 보존된다 |
| AC-06 | test | 대기방에서 친구별 초대 버튼으로 초대를 발송·수신·수락·거절·만료할 수 있고, 가득 찬 방·삭제/시작된 방 등 입장 불가 사유가 최종 입장 시 서버에서 재검증된다 |
| AC-07 | manual | SFX-DEFER-19: 실제 게임 초대 서버 생성·발신·수신 경로를 F16 game-invite 재생기에 연결한다. inviteId와 수신자 계정 검증에 따라 신규 수신1회, 중복/조회복원/재접속0회를 유지한다. 만료·거절·차단·알림off/mute·계정전환 및 재생실패/영구대기가 초대 수락·거절·입장을 막지 않음을 실제 경로 테스트와 다중계정 앱 내 브라우저로 검증한다(2026-09-14 사용자 후속 지시로 외부 Chrome에서 변경). 방코드 입장을 초대 수신으로 간주하지 않으며 미확인 자산은 무음과 사유를 유지한다. 모의재생을 청음으로 주장하지 않고 F28 이관표에 증거를 기록한다. |

**계획 심사·준비 판단 근거**

- 2026-09-13 15:00:23 · [CLAUDE-PLAN-1.json](<C:/Users/minsa/jokertest/.pluto/slices/BD/runs/CLAUDE-PLAN-1.json>) · PASS: All selected graph entities, claimed call paths, and repository facts were verified against the working tree at HEAD ae40d975; the nine new files are absent, every acceptance criterion is covered with concrete design and test contracts, and the unsure entries are representation constraints or verification-pending items rather than unresolved prerequisites.
- 마지막 구조화 계획안: [PLAN-23.json](<C:/Users/minsa/jokertest/.pluto/slices/BD/runs/PLAN-23.json>) · 준비 완료.
- 현재 상태에 기록된 병합 커밋: `38d1659af7254f1b615d993fbf1cc7b6dd4cb0f2`.

원본: [상태·저장 계획](<C:/Users/minsa/jokertest/.pluto/slices/BD/state.json>) · [회차별 기록 폴더](<C:/Users/minsa/jokertest/.pluto/slices/BD/runs>)

### F20 · 대기방 설정 변경 (BE)

**현재 상태:** 완료·병합. 계획 기록 12건 / 별도 독립 계획 심사 2건. 상태 파일의 전체 단계 retry=11.
**기록 구간:** 2026-09-17 14:19:25 ~ 2026-09-17 22:48:42 KST (각 호출의 기록 시각).
**계획 목표:** 방장 대기방 설정 변경을 서버 권한·설정 버전·준비 해제·게임 시작 경합과 일관되게 연결한다.

- 정원 하한에 확정 참가자와 유효한 초대 입장 예약을 포함하고, 실제 변경 시 전원 준비 해제·동일값 저장 시 준비 보존으로 정했다.
- 설정 버전과 요청 식별자로 지연 응답·중복 저장을 처리하고 이미 시작한 게임의 역할·시간은 소급 변경하지 않는다.
- 사용자 승인으로 F20은 현재 생성/편집 및 실제 소비 변환 경로의 관전자 필드 제거, 다음 방 실제 저장·복원은 F24/F28 담당으로 나눴다.

**주요 쟁점:** 현재 편집 기능과 아직 구현하지 않은 다음 방 복원을 한 완료조건에서 요구한 문제가 범위 분리로 정리됐다.

**해석·미검증 경계:** F24의 AC-RESTORE-24와 F28의 AC-RESTORE-INTEGRATION-28은 여전히 필수다. F20 통과로 후속 복원이 검증됐다고 볼 수 없다.

**현재 저장된 성공조건**

| ID | 확인 방식 | 조건 |
|---|---|---|
| AC-01 | test | 방장이 아니거나 대기 상태가 아니거나 현재 방이 아닌 사용자의 설정 변경 요청은 서버에서 거부된다. |
| AC-02 | test | 변경하려는 정원이 현재 참가 인원보다 작으면 서버가 저장을 거부한다. |
| AC-03 | test | 입장 방식·정원·직업 구성·광대/특수 직업 수·토론/투표/밤 제한시간을 편집·저장하면 참가자와 방 목록에 즉시 반영된다. |
| AC-04 | test | 설정 저장 시 정의된 준비 상태 해제 정책이 적용되고, 저장과 게임 시작 요청이 동시에 발생해도 하나의 설정으로만 게임이 시작된다. |
| AC-05 | test | 재접속하거나 방장이 변경된 클라이언트는 최신 서버 설정을 불러오며, 이미 시작된 판의 역할·제한시간은 소급 변경되지 않는다. |
| AC-06 | manual | 관전자 관련 설정 필드는 현재 방의 생성·편집 UI, 설정 저장 요청·저장값·참가자/공개 응답 및 실제 생성·편집에서 소비하는 공용 설정 변환 결과 어디에도 포함되지 않는다. |

**계획 심사·준비 판단 근거**

- 2026-09-17 14:51:13 · [CLAUDE-PLAN-1.json](<C:/Users/minsa/jokertest/.pluto/slices/BE/runs/CLAUDE-PLAN-1.json>) · PASS: The plan's selected symbols, absent new-entity targets, and all load-bearing behavioral claims were verified against the current tree, every acceptance criterion has concrete modification and regression coverage, and the unsure entries are graph-ID bookkeeping or F23/F24/F28 handoffs rather than unresolved implementation prerequisites.
- 2026-09-17 22:48:42 · [CLAUDE-PLAN-2.json](<C:/Users/minsa/jokertest/.pluto/slices/BE/runs/CLAUDE-PLAN-2.json>) · PASS: All selected symbols and claimed new entities were verified to exist in the current repository (root tree and BE candidate worktree a77d2a5d at the stated locations), the handleUpdateRoomSettings implementation matches the plan's AC-01/02/04/06 contracts (host·membership·waiting checks, occupancy floor via countRoomOccupancy, version conflict, requestId replay, allowlist validation, ready reset with readyRevision increment and emitRoomSettingsUpdated), all six acceptance criteria are covered with concrete test/file…
- 마지막 구조화 계획안: [PLAN-12.json](<C:/Users/minsa/jokertest/.pluto/slices/BE/runs/PLAN-12.json>) · 준비 완료.
- 현재 상태에 기록된 병합 커밋: `f09779960c1432de9529c79e3e5ba33af2c29ece`.

원본: [상태·저장 계획](<C:/Users/minsa/jokertest/.pluto/slices/BE/state.json>) · [회차별 기록 폴더](<C:/Users/minsa/jokertest/.pluto/slices/BE/runs>)

### F21 · 방장 추방 (BF)

**현재 상태:** 완료·병합. 계획 기록 11건 / 별도 독립 계획 심사 1건. 상태 파일의 전체 단계 retry=10.
**기록 구간:** 2026-09-18 00:39:29 ~ 2026-09-18 01:34:23 KST (각 호출의 기록 시각).
**계획 목표:** 방장 추방을 대기방·게임 진행 상태에 맞게 처리하고 기존 이탈·전적·보상 규칙과 일관되게 만든다.

- 대기방 추방 후 새 입장은 허용하고, 진행 중 추방 후 같은 gameId 복귀는 차단하되 다른 새 게임은 허용하도록 했다.
- 진행 중 생존자는 일반 명시적 이탈과 같은 사망 처리, 이미 사망한 참가자는 사망 원인·roster를 보존한 참여 종료로 구분했다.
- 10분·4096개 추방 결정 기록, 중복/경합, 종결 저장의 불변 기록·단일 재시도와 이탈 계정 캐시 갱신을 계획했다.
- 미커밋 경기의 프로세스 소실을 새 영속 게임 복구 시스템으로 확장하지 않는 경계를 남겼다.

**주요 쟁점:** 계획 이후의 증거 누락·심사 복구와 DB 시험 대기 결함은 후속 구현/검증 이력이다. 이를 11개 PLAN 기록과 같은 종류의 계획 반려로 합산하지 않는다.

**해석·미검증 경계:** F21은 별도 공식 전체 시험·외부 Chrome·승인·병합 증거가 있다. 이번 보고서는 그 검증을 재실행하지 않고 기록상의 완료만 확인한다.

**현재 저장된 성공조건**

| ID | 확인 방식 | 조건 |
|---|---|---|
| AC-01 | test | 방장이 아닌 사용자가 추방을 요청하면 서버가 이를 거부한다. |
| AC-02 | test | 방장이 대기방에서 실제 참가자 목록 중 대상을 확인 절차를 거쳐 추방하면 대상이 서버에서 퇴장 처리되고 방 인원·준비 상태가 동기화된다. |
| AC-03 | test | 진행 중 추방은 D-13의 이탈 사망 규칙을 재사용해 대상의 사망·전적·보상이 일반 이탈과 동일하게 처리된다. |
| AC-04 | test | 본인 대상, 이미 이탈한 대상, 오래된(무효) 방에 대한 추방 요청, 동일 대상에 대한 중복 추방 요청은 서버가 거부한다. |
| AC-05 | test | 추방 처리와 대상의 자발적 이탈이 동시에 발생해도 방 인원·게임 상태가 중복 반영되지 않고 일관되게 동기화된다. |
| AC-06 | test | 추방된 대상에 대한 재입장 허용 여부가 확정된 정책대로 서버에서 일관되게 적용된다. |

**계획 심사·준비 판단 근거**

- 2026-09-18 01:34:23 · [CLAUDE-PLAN-1.json](<C:/Users/minsa/jokertest/.pluto/slices/BF/runs/CLAUDE-PLAN-1.json>) · PASS: All selected entities, claimed behaviors (including commitDayVoteResolution at line 2351, missing hostUuid in session candidate/snapshot, forced alive=true in setGamePayload, and leave's idempotent success ACK), referenced test harnesses, and new-entity targets verify against the current tree, and all six acceptance criteria have concrete implementation and test contracts.
- 마지막 구조화 계획안: [PLAN-11.json](<C:/Users/minsa/jokertest/.pluto/slices/BF/runs/PLAN-11.json>) · 준비 완료.
- 현재 상태에 기록된 병합 커밋: `688026119c404a615c2808f79db762aab5627155`.

원본: [상태·저장 계획](<C:/Users/minsa/jokertest/.pluto/slices/BF/state.json>) · [회차별 기록 폴더](<C:/Users/minsa/jokertest/.pluto/slices/BF/runs>)

### F22 · 강제 종료·종료 정리 (BG)

**현재 상태:** 사용자 취소. 계획 기록 7건 / 별도 독립 계획 심사 0건. 상태 파일의 전체 단계 retry=1.
**기록 구간:** 2026-09-18 18:26:01 ~ 2026-09-18 18:48:48 KST (각 호출의 기록 시각).
**계획 목표:** 당초 방장 강제 종료와 무효 경기 처리·종료 안내·정리를 구현하려던 계획이었다.

- 종료 이유·무효 경기·보상 없음·단일 종료 결정을 계획했다.
- 종료 알림 유실과 재접속, 요청 결과 보존 기간·용량·UNKNOWN 처리까지 보완했다.
- DB 커밋 전 서버 소실과 참가자 종료 안내의 영속 복구 경계가 미확정으로 남아 반복 반려됐다.
- 사용자가 기능 불필요를 명시해 2026-09-18 공식 취소했다. 미연결 버튼 삭제는 57f18672에 반영됐다.

**주요 쟁점:** 이제 해결할 계획 차단이 아니라 취소된 요구다. 계획 원본은 보관했지만 재개·재등록하면 안 된다.

**해석·미검증 경계:** 취소는 구현 성공·PASS·병합 완료가 아니다. 원래 32개에서 유효 범위 31개로 줄었다.

**현재 저장된 성공조건**

| ID | 확인 방식 | 조건 |
|---|---|---|
| AC-01 | test | 방장의 강제 종료 요청은 서버가 권한(방장 여부)을 검사하며, 권한 없는 사용자의 강제 종료 요청은 거부된다. |
| AC-02 | test | 강제 종료가 확정되면 중단 사유가 저장되고 게임 타이머·방/게임 상태·관련 소켓 상태가 정리되며 모든 참가자에게 종료 사유와 이동 경로가 안내된다. |
| AC-03 | test | 강제 종료된 경기는 무효 경기로 기록되며 참가자에게 업적·재화 보상이 지급되지 않는다. |
| AC-04 | test | 강제 종료 요청이 중복으로 들어오거나 정상 승패 종료와 동시에 발생해도 게임 종료 처리는 단 한 번만 마감된다. |
| AC-05 | manual | 강제 종료 처리 후 참가자는 로비로 이동하거나 새 방에 입장할 수 있다. |
| AC-06 | build | 프론트엔드 production build가 강제 종료 관련 변경을 포함해 성공한다. |

**계획 심사·준비 판단 근거**

- 별도 독립 계획 심사 파일은 보존 목록에 없다. PLAN 응답과 엔진 로그를 근거로 준비 상태를 구분한다.
- 마지막 구조화 계획안: [PLAN-7.json](<C:/Users/minsa/jokertest/.pluto/monitor/F22-cancelled-20260918/slice/runs/PLAN-7.json>) · 준비 미완료.
- 미해결: AC-02·AC-05: backend/socket/gameSession.js::persistTerminalSession·attemptTerminalPersist는 메모리의 불변 레코드를 비동기 저장한다. 동기 강제 종료 확정 후 DB 커밋 전 재시작에서도 참가자 종료 사실을 보존할 저장 경계와 시작 시 복구 소비처를 확정해야 한다. 신규 handleGetForceEndNotices·handleAcknowledgeForceEndNotice 및 frontend/src/domains/game/ingame/store/forceEndNoticeStore.js::useForceEndNoticeStore로 이어지는 미확인/확인 영속화·마이그레이션·보존/복구 계약이 필요하다.
- 미해결: AC-01·AC-04: backend/socket/gameSession.js::handleGetForceEndResult와 frontend/src/domains/game/ingame/hooks/useForceEndGame.js::useForceEndGame의 TTL·용량·UNKNOWN 계약은 정했으나, 재시작 후 결과 미확인 상태를 참가자의 보존된 종료 사실과 연결하는 필수 저장 경계는 미확정이다. 추방 전용 backend/socket/kickReceiptStore.js나 공개 game_results.settings로 대체하지 않고 위 영속 복구 계약과 함께 확정해야 한다.

원본: [상태·저장 계획](<C:/Users/minsa/jokertest/.pluto/monitor/F22-cancelled-20260918/slice/state.json>) · [회차별 기록 폴더](<C:/Users/minsa/jokertest/.pluto/monitor/F22-cancelled-20260918/slice/runs>)

### F23 · 관전자 설정·입장·권한 전면 제거 (BH)

**현재 상태:** PLAN human. 계획 기록 13건 / 별도 독립 계획 심사 0건. 상태 파일의 전체 단계 retry=3.
**기록 구간:** 2026-09-18 19:12:29 ~ 2026-09-18 19:57:40 KST (각 호출의 기록 시각).
**계획 목표:** 외부 관전자 기능을 제거하면서 기존 사망 참가자의 계속 보기·나가기·정상 수신·재접속을 유지한다.

- 관전자 설정·라우트·저장 키 제거와 비참가자의 입장/공개 구독 차단을 계획했다.
- 기존 사망 참가자는 외부 관전자와 구분하고 계속 보기 또는 명시적 나가기를 제공하도록 했다.
- F24 설정 복원 및 F25~27 사건·영상과의 완료 경계, 초대 입장 확정 전 수신 차단, ACK 유실 후 화면 처리를 반복 보완했다.
- PLAN-10 호출 실패 후 공식 인프라 복구 1회를 수행했으나 PLAN-13은 준비 미완료로 돌아왔고 PLAN human에서 멈췄다.

**주요 쟁점:** 마지막 기록의 7개 차단에는 작업 간 완료 경계, 입장 제외/해제 소유권, 개별 전달 권한, 최종 사망·잠정 피격 구분, 페이지 오류 복구, 허용 후보 목록 불일치가 포함된다.

**해석·미검증 경계:** 현재 미구현·미검증이며 작업폴더도 없다. PLAN-13 ok=true는 응답 수신 성공일 뿐, readiness=false를 승인으로 바꾸지 않는다.

**현재 저장된 성공조건**

| ID | 확인 방식 | 조건 |
|---|---|---|
| AC-01 | manual | 인게임 방관리 설정, 대기방/방 생성, 다음 게임 설정 복원 UI에서 관전자 허용 체크박스 및 관련 항목이 모두 제거되어 있다 |
| AC-02 | build | 관전 버튼, 관전 입장 라우트, 관전 모달, 관전 관련 문구와 상태가 코드베이스에서 제거되어 있다 |
| AC-03 | test | 오래된 저장 설정에 allow-spectators 등 관전 관련 키가 있어도 읽기/복원 시 제거되어 새 설정 화면에 다시 나타나지 않는다 |
| AC-04 | test | 방 코드, 게임 초대, 직접 URL, API/소켓 요청으로 게임 참가자가 아닌 사용자가 관전 목적으로 입장하거나 공개 상태를 구독할 수 없고 서버가 거부한다 |
| AC-05 | test | 이미 게임에 참가한 사망 참가자는 기존 참가자 신분을 유지하며 허용된 결과 공개와 밤 영상 수신, 생존 여부에 따른 행동 제한, 기존 재접속 자격이 정상 동작한다 |
| AC-06 | manual | 사망한 참가자에게 관전 지속과 게임 나가기 중 선택할 수 있는 옵션이 제공되고 정상 동작한다 |

**계획 심사·준비 판단 근거**

- 별도 독립 계획 심사 파일은 보존 목록에 없다. PLAN 응답과 엔진 로그를 근거로 준비 상태를 구분한다.
- 마지막 구조화 계획안: [PLAN-13.json](<C:/Users/minsa/jokertest/.pluto/slices/BH/runs/PLAN-13.json>) · 준비 미완료.
- 미해결: AC-01·AC-03: SettingRoomTab.jsx::SettingRoomTab/handleRoomAction에서 GameSetupPage.jsx::GameSetupPage까지 실제 다음 방 설정 생산·저장·복원 연결이 없으며 현재 F23 AC와 F24 RESTORE-24·F28 RESTORE-INTEGRATION-28의 공식 완료 대응이 미확정이다.
- 미해결: AC-04: matchmaking.js::handleAcceptGameInvite/removePublishedAdmission/scheduleLateJoinCleanup/releasePublishedAdmission 및 channelMembership.js::releaseChannelExclusion 사이에서 제외 시작·확정 해제·늦은 정리의 소유권 계약을 끝까지 확정해야 한다.
- 미해결: AC-04·AC-05: gameSession.js::resolveSessionParticipantSockets의 참여 종료·현재 소켓 검증을 모든 개별 전달 호출부와 연결하고 지연 leave 중 실제 수신 0 시험을 확정해야 한다.
- 미해결: AC-05: handleResolveNight에서 F25 사건 생산·F26 대상자 봉투·F27 구독/영상/ACK 소비까지의 실제 심볼·회귀 시험 및 현재 F23 보존 완료 경계가 미확정이다.
- 미해결: AC-06: InGamePage.jsx::InGamePage/useInGameExit.js::useInGameExit/createLeaveGameSessionRequest.js::createLeaveGameSessionRequest의 실패·재시도·서버 커밋 후 ACK 유실 소비와 실제 페이지 마운트 시험 계약이 미확정이다.
- 미해결: AC-06: game-core/gameSession.js::commitNightResolution의 현재 최종 사망과 F25 잠정 피격·치료 대기를 구분해 선택 UI에 전달하는 공식 필드·시험 계약이 미확정이다.
- 미해결: 잠금 부품은 .pluto/index.json에 존재하지만 X0315·X0539·F2103·F2104·F0361·F0364·F0315·F0305·F0331·X0143이 이번 허용 후보 목록에 없다. 확인된 파일·심볼 대응을 공식 후보/계획 비교에 반영해야 기존 선택·제외 계약을 기계적으로 보존할 수 있다.

원본: [상태·저장 계획](<C:/Users/minsa/jokertest/.pluto/slices/BH/state.json>) · [회차별 기록 폴더](<C:/Users/minsa/jokertest/.pluto/slices/BH/runs>)

## 5. 기록에서 반복된 문제

다음은 보존된 계획과 반려 근거를 종합한 해석이다. 실제 장애 원인을 새로 재현한 결과와 구분한다.

1. **실제 사용 지점의 연결 부족.** API·저장소·컴포넌트가 존재하는 것만으로 끝나지 않고 서버 사건 → 수신 권한 → store → 실제 화면까지 연결할 계획이 반복해서 요구됐다. F14 외형, F16 효과음, F17 알림, F19 초대, F23 사망 참가자 처리가 해당한다.
2. **후속 기능과 현재 완료 범위의 혼합.** F16·F20은 사용자 승인으로 분담을 명시했고, F23에서는 현재 기능 보존과 F24~27의 미래 산출물을 어떻게 검증할지가 다시 쟁점이 됐다.
3. **코드 지도와 실제 파일·후보 목록 불일치.** 잠금된 코드 ID가 이번 후보에서 빠지거나 읽은 기준본이 달라 실제 구현 유무를 잘못 판단할 위험이 계획 메모에 반복됐다.
4. **실패·지연·계정 전환 경로의 구체화 필요.** 중복 요청, 역순 응답, ACK 유실, 지연 commit/join, 새 방·새 계정 상태 보호가 기능별로 반복 보완됐다.
5. **서로 다른 실패를 구분해야 한다.** 호출 실패, 준비 미완료, 독립 심사 REJECT, 구현 시험 실패는 별개다. 하나의 “반려 횟수”로 합치면 병목을 잘못 해석할 수 있다.

## 6. 현재 F23에 남은 정리 항목

- 승인된 F23/F24/F25~27/F28 분담을 현재 성공조건과 실제 파일·회귀 시험에 대응한다. 후속 미구현 기능을 완료로 간주하거나 F23 조건을 임의 면제하지 않는다.
- 초대 입장 join 이후 확정 전 수신 차단, 제외 해제와 늦은 정리의 소유권을 실제 전달 시험에 연결한다.
- 기존 참가자·명시적 이탈자·외부 계정의 수신 경계를 전체 개별 전달 호출부에 적용할 계획을 구체화한다.
- 최종 사망과 잠정 피격을 구분하고, 보기/나가기 화면의 실패·재시도·ACK 유실 복구를 실제 페이지 소비처와 연결한다.
- 현재 index에 있는 잠금 코드 ID와 허용 후보 목록의 불일치를 공식 경로로 해소한다. 상태 파일 편집·ID 위조·강제 PASS는 하지 않는다.

이 목록은 이번 보고서의 진단 요약이다. 새 구현 승인·계획 승인·추가 재시도를 수행했다는 뜻이 아니다.

## 7. 원본과 부록

- [전체 133건 회차별 기록표](<C:/Users/minsa/jokertest/docs/reports/F14-F23-plan-history-20260918/rounds.md>): 기록 시각, 실행 메타데이터, 탐색/계획/독립 심사 구분, 준비·판정 결과, 원본 링크.
- [기계 판독용 근거 색인](<C:/Users/minsa/jokertest/docs/reports/F14-F23-plan-history-20260918/evidence-index.json>): 원본 SHA256, 상세 차단 사유, 상태 스냅샷 요약, 전체 단계 재시도 사유.
- [F16 범위 분리 계약](<C:/Users/minsa/jokertest/docs/requirements/2026-09-12-sfx-scope-split.md>).
- [F20 설정 복원 검증 분리](<C:/Users/minsa/jokertest/docs/requirements/2026-09-17-room-settings-verification-split.md>).
- [후속 작업 담당·검증 계약](<C:/Users/minsa/jokertest/docs/requirements/2026-09-13-heavy-task-preflight.md>).
- [F22 취소 계약](<C:/Users/minsa/jokertest/docs/requirements/2026-09-18-remove-host-force-end.md>).

이번 작성은 원본 읽기와 보고서 생성만 수행했다. 배치·데몬·예약·성공조건·심사 판정·제품 코드를 변경하지 않았다. 원본 prompt 전문은 보고서에 복제하지 않았고 각 기록 링크와 해시로 추적할 수 있게 했다.
