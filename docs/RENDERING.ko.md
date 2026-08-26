# 렌더링

## 렌더러 선택

`renderer` 설정은 세 값을 가지며, kit 이 presenter 를 요청할 때 pane 마다 한 번 읽습니다. 이미 열린
pane 은 렌더러를 유지합니다.

- `dom`: 팩토리가 kit 자체 frame presenter(`createProviderFramePresenter`)를 반환하므로 pane 은 kit 의
  DOM 표면이며 `terminal-screen[/suffix]`·`terminal-input[/suffix]` 노드가 같습니다. 그 pane 에서는 abyss
  모듈이 실행되지 않습니다.
- `canvas` (기본): `CanvasPainter` 를 쓰는 abyss pane.
- `webgl`: `WebglPainter` 를 쓰는 abyss pane. WebGL 컨텍스트를 잃거나 컨텍스트·셰이더 준비가 실패하면
  새 canvas 요소에 `CanvasPainter` 로 교체합니다. canvas 는 처음 받은 컨텍스트 종류를 유지하므로 교체는
  새 canvas 이며, 사유는 pane 루트에 `data-renderer-refusal` 로 노출됩니다.

기본이 Canvas 2D 인 이유는 WebGL pane 이 자기 렌더링 컨텍스트를 보유하기 때문입니다. 2026-08-26 실측으로
WebGL pane 은 20.2 MB, Canvas 2D pane 은 9.2 MB 였고, pane 6개에서 10 MiB 출력 적용이 Canvas 2D 1337 ms,
WebGL 4577 ms 였습니다. pane 하나만 띄운 유휴 호스트에서는 WebGL 이 더 빠르므로 설정으로 남깁니다.

## 프레임 모델

화면은 엔진이 소유합니다. 프레임은 `{ outputSequence, cols, rows, cursor: [row, col], cursorVisible,
altActive, historySize, offset, modes, full, lines }` 입니다. `lines[]` 는 `{ y, wrapped, runs }` 를
담고, run 은 `{ text, fg, bg, attrs, n, wide?, link? }` 를 담습니다. run 은 `n` 개 셀을 덮습니다
(`wide` 이면 글리프당 2). 색은 `default`, `palette:N`(0..255), `#rrggbb` 이며 다른 문법은 디코드 오류입니다.
속성 비트: 1 굵게, 2 흐리게, 4 기울임, 8 밑줄, 16 반전, 32 취소선, 64 숨김. `full: false` 는 바뀐 행만
나열하며, full 프레임 없이 온 delta 는 presenter 가 루트에 `soksak:terminal-frame-request` 를 발행하고
아무것도 적용하지 않습니다.

`frame-source.ts` 는 절대 인덱스 `abs = historySize - offset + y` 로 행을 저장하며 상한은 10000 행입니다.
live 화면 위의 행은 presenter 가 본 스크롤백이고, `read()` 가 live 행과 함께 이어 붙입니다. `historySize`
가 줄면 선택이 무효가 됩니다. 테마가 바뀌면 캐시된 행을 epoch 로 지연 재해석합니다.

## Painter 구현

`painter.ts` 는 하나의 `Painter` 계약과 두 구현을 제공합니다.

- `CanvasPainter` 는 dirty 행과 인접 행을 다시 그립니다. 행마다 배경 채우기 한 번, 테마 배경과 다른 배경
  run, 선택 오버레이, 굵게·기울임·흐리게·밑줄·취소선이 적용된 글리프, 링크 밑줄, 커서(block·underline·bar,
  pane 이 비포커스면 외곽선), 그리고 `offset > 0` 인 동안 8 px 스크롤바를 그립니다. 백킹 스토어는 device
  pixel ratio 로 배율을 적용하고 컨텍스트 변환은 resize 마다 한 번 설정합니다.
- `WebglPainter` 는 행마다 인스턴스 버퍼(`x y w h`, 배경 RGBA, 전경 RGBA, atlas uv)를 두고 dirty 행만
  다시 업로드합니다. 글리프는 필요할 때 2D atlas canvas 에 래스터화하며, 가득 차면 크기를 두 배로 늘리고
  하나의 텍스처로 업로드합니다. 같은 폰트·같은 배율로 그리는 모든 pane 이 atlas 하나를 공유합니다 —
  픽셀이 같기 때문입니다 — 그리고 각 painter 는 atlas 가 자신이 업로드하지 않은 generation 을 보고할 때
  자기 텍스처로 업로드합니다. painter 를 폐기하면 GL 컨텍스트를 놓고 두 canvas 를 비웁니다. canvas 는
  비우기 전까지 드로잉 버퍼를 보유합니다. 인스턴스 패스 두 번으로 배경과 글리프를 그립니다.
  `webglcontextlost` 는 `onFallback` 을 호출하고, pane 은 새 canvas 요소에 `CanvasPainter` 로 교체합니다.

## 측정 규칙

`font-metrics.ts` 는 `M` 의 advance 로 셀 너비를, ascent + descent + 2 px 로 글리프 박스를 구합니다.
셀 높이는 그 박스에 `lineHeight` 를 곱한 값이고, 베이스라인은 박스를 셀 안에서 가운데 둡니다. 값은 device
pixel 격자에 맞춥니다. `fit()` 은 `floor(root.clientWidth / cellWidth) x floor(root.clientHeight /
cellHeight)` 를 반환합니다. 그려진 격자의 기준은 프레임이므로 `size()` 는 프레임 크기를, `measure()` 는
kit 이 resize 요청에 쓰는 맞춤 크기를 반환합니다. `dom` 렌더러는 kit 과 같은 방식으로 측정합니다.

## 스케줄링

`applyFrame` 은 동기로 적용하고 `paint-scheduler.ts` 에 페인트 한 번을 요청합니다. pane 이 보이면
animation frame, 숨겨져 있으면 16 ms 타이머이며, 둘을 동시에 쓰지 않습니다. 화면 노드의 render sequence
는 페인트마다 1 증가합니다.
