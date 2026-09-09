# 음악 무음 적용 기록

날짜: 2026-09-09

사용자 지시: ‘법적위험이 1이라도 있다면 그냥 하지말라’, 이어서 ‘무음 처리 및 기록까지’.

이 지시에 따라 음악 무음 적용만 현재 작업 트리에 구현했다. 전체 기능 요구사항 및 Pluto 배치는 아직 미승인이며 데몬에 작업을 전달하지 않았다.

## 적용 내용

| 위치 | 처리 |
|---|---|
| `frontend/src/shared/constants/bgmAssets.js` | `MUSIC_PLAYBACK_ENABLED = false`로 음악 재생 정책 고정. 사용자 정책 변경 전 재활성화 금지 사유 기록 |
| `frontend/src/domains/auth/components/AuthScene/AuthBackgroundMedia.jsx` | 로그인/가입 화면에서 음악 audio 요소를 생성하지 않아 음원을 로드하지 않음 |
| `frontend/src/domains/lobby/components/LobbyBackground.jsx` | 로비에서도 음악 audio 요소를 생성하지 않음 |
| `frontend/src/shared/hooks/useBgmAutoplay.js` | 음악 자동재생 및 클릭 재시도 리스너 등록 차단. 기존 ref가 있으면 음소거·볼륨 0·일시정지 |
| `frontend/src/shared/hooks/useAudioControl.js` | 음소거 해제/볼륨 변경으로 재활성화 불가. 표시값·실제 media 모두 무음 유지 |
| `frontend/src/shared/ui/SoundControl.jsx` | 음소거 버튼·음량 슬라이더 비활성화, 접근성 안내 ‘배경음 사용 안 함’ |

현재 영상 요소 6곳(로그인, 로비, 설정, 상점, 게임 승패, 킬 연출)은 모두 기존 `muted` 설정을 유지한다. 영상 자체의 재생·스킵·완료 콜백을 변경하지 않았다. 영상 파일의 오디오 트랙을 편집하거나 원본 파일을 삭제하지 않았다.

`frontend/public/bgm/LoginMusic.wav`는 보존했다. 이 파일은 로그인과 로비 양쪽에서 참조되고 있었으며 둘 다 차단했다. 초기 그래프 조사에서 로비 경로만 확인했던 내용을 현재 파일 전수검색으로 보완했다.

## 확인 결과

- `npm test --prefix frontend`: **1,164개 통과, 실패/건너뜀 0개**.
- `npm run build --prefix frontend`: **통과**. 산출물 chunk 크기 경고가 있으며 빌드 실패는 아니다.
- jsdom에서 실제 `useBgmAutoplay`와 `useAudioControl`을 함께 마운트: 최초 진입·창 클릭·음소거 해제·볼륨 1 변경 시도 후에도 `play()` 호출 0회, 실제 media muted=true/volume=0, 컨트롤 disabled=true 확인.
- TypeScript JSX AST로 현재 프론트의 video 요소를 열거: **6곳 모두 muted=true**.
- `git diff --check`: 통과.
- 실제 브라우저 청음은 이번에 실행하지 않았다. 중지된 앱 서버를 재기동하지 않았다.

적용 범위는 현재 소스와 빌드 결과다. 별도 배포 서버를 배포하거나 이미 열려 있던 브라우저에 강제로 새 코드를 로드하지 않았다.

## 이후 작업의 준수 사항

- 음악 제작 F-16A·F-16B는 계속 보류하고 Pluto 실행 입력에서 제외한다.
- 일반 설정/영상 연결 작업에서 음악 정책을 임의로 true로 바꾸거나 다른 곡·샘플·생성 서비스로 우회하지 않는다.
- F-16은 이 무음 처리를 완료된 선행 변경으로 인식하고, 남은 공통 볼륨 UI 기능과 중복 구현하지 않는다.
- 이번 변경은 음원에 법적 무위험 인증을 부여한 것이 아니라, 음악을 사용하지 않도록 처리한 것이다.
