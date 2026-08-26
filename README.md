# soksak-plugin-terminal-abyss

Terminal plugin that paints engine-authoritative screen frames for `soksak-kit-plugin-terminal`.

The common terminal kit owns view registration, sessions, splits, PTY and recovery lifecycle, resize
coordination, public status, theme resolution, waits, and every standard command. This plugin owns
one pane presenter: frame decoding, the row cache, glyph painting on a canvas (WebGL with a Canvas
2D fallback), selection, links, key and mouse encoding, composition, the viewport, and the paint
scheduler. `frontend/src/abyss` imports nothing outside itself; `frontend/src/host` adapts the
application and the kit to it. See `docs/RENDERING.md` for the frame model and measurement rules.

Settings: `engine` (default alacritty); `renderer` with three values, `dom` (the kit's own DOM
presenter), `canvas` (default) and `webgl` (falls back to `canvas` when the context is lost), read
once per pane; `fontSize` (default 13). A WebGL pane holds a rendering context of its own: measured
2026-08-26 it cost 20.2 MB against a Canvas 2D pane's 9.2 MB, and with six panes open Canvas 2D
applied 10 MiB of output in 1337 ms against WebGL's 4577 ms. WebGL is faster for a single pane on an
idle host, which is why it stays a setting. Font family comes from the host `--mono` variable, falling
back to `Menlo, monospace`.

## Verification

The package depends on `@soksak/soksak-contract-plugin-terminal` and `@soksak/soksak-kit-plugin-terminal`,
so every `make` invocation that installs requires `REGISTRY` on the make command line,
`https://registry.npmjs.org` included once the packages are published there. A value from the
environment is refused. The Makefile reads the requirement from `frontend/package.json` and refuses
`REGISTRY required: this package depends on @soksak/...` when it is absent.

The build input is identified by the `pnpm-lock.yaml` integrity, not by `REGISTRY`.

```sh
make verify REGISTRY=http://host:port/
