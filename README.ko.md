# soksak-plugin-terminal-abyss

`soksak-kit-plugin-terminal`에 엔진이 결정한 화면 프레임을 그리는 pane presenter를 제공하는 터미널 플러그인입니다.

공통 terminal kit가 view 등록, 세션, 분할, PTY 및 복원 수명 주기, 크기 변경 조정, 공개 상태, theme
해석, wait와 모든 표준 명령을 소유합니다. 이 플러그인은 pane presenter 하나만 소유합니다: 프레임
해석, 행 캐시, 캔버스 글리프 페인팅(WebGL, Canvas 2D 대체), 선택, 링크, 키·마우스 인코딩, 조합 입력,
viewport, paint scheduler. `frontend/src/abyss`는 자기 밖의 어떤 것도 import하지 않으며
`frontend/src/host`가 애플리케이션과 kit를 거기에 맞춥니다. 프레임 모델과 측정 규칙은
`docs/RENDERING.md`에 있습니다.

설정: `engine`(기본 alacritty); `renderer`는 세 값 `dom`(kit 자체 DOM presenter), `canvas`,
`webgl`(컨텍스트를 잃으면 `canvas`로 내려감)이며 기본은 `canvas`, pane 생성 시 한 번 읽습니다;
`fontSize`(기본 13). WebGL pane 은 자기 렌더링 컨텍스트를 들고 있어 2026-08-26 실측으로 pane 당 20.2 MB,
Canvas 2D 는 9.2 MB 였고, pane 6개에서 10 MiB 출력 적용이 각각 4577 ms 와 1337 ms 였습니다. pane 하나만
띄운 유휴 상태에서는 WebGL 이 더 빠르므로 설정으로 남깁니다.
글꼴은 host의 `--mono` 변수에서 읽고 없으면 `Menlo, monospace`를 씁니다.

## 검증

이 패키지는 `@soksak/soksak-contract-plugin-terminal`과 `@soksak/soksak-kit-plugin-terminal`에
의존하므로, install을 수행하는 모든 `make` 호출은 make 명령줄의 `REGISTRY`를 요구합니다. 패키지가
`https://registry.npmjs.org`에 게시된 뒤에도 같습니다. 환경 변수로 전달된 값은 거부됩니다. Makefile은
`frontend/package.json`에서 이 요구를 읽고, 없으면
`REGISTRY required: this package depends on @soksak/...`으로 거부합니다.

빌드 입력의 정체성은 `REGISTRY`가 아니라 `pnpm-lock.yaml`의 integrity입니다.

```sh
make verify REGISTRY=http://host:port/
