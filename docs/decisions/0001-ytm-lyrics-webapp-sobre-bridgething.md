# ADR 0001 — Player + lyrics sincronizadas de YouTube Music en el Car Thing, como webapp BridgeThing

- Estado: **aceptado** (todas las incógnitas verificadas con evidencia, ver §Fundamento)
- Fecha: 2026-09-18
- Código evaluado: `JoeyEamigh/bridgething@c8058c7` (0.13.1, 2026-09-17), `JoeyEamigh/yocto-superbird` HEAD

## Contexto

Tengo un Spotify Car Thing con BridgeThing instalado y un Mac (macOS 27.0 beta, 26A5388g)
donde escucho YouTube Music en Chrome. Quiero que el Car Thing muestre un player mínimo
y la letra sincronizada de lo que suena. YouTube Music no ofrece ni API de now-playing
ni lyrics sincronizadas; nada de esto es nativo de BridgeThing.

## Decisión

**Una sola pieza propia: una webapp BridgeThing corriendo en el dispositivo.**
Nada custom corre en el Mac. El companion de escritorio oficial de BridgeThing (Tauri,
`darwin-aarch64`, feed OTA `ota.bridgething.com/desktop/stable`, 0.13.1) es el gateway;
Chrome sigue siendo el player.

```
Mac                                          Car Thing (USB-C, red sobre USB)
Chrome + YTM ─Media Session─▶ macOS Now Playing
  ─MediaRemote (helper .m vía perl)─▶ companion ─ws :8892─▶ daemon ─ws :8891─▶ WEBAPP
LRCLIB ◀──────────────────────────── companion (client.net.fetch tunelizado) ◀─┘
```

Rechazado explícitamente:

- **Server/microapp propio en el Mac** — duplica el rol del companion y obliga a
  reimplementar msgpack + framing + surfaces del protocolo. Deuda sin beneficio.
- **Player propio de YTM (wrapper de music.youtube.com)** — no aporta control ni lyrics
  extra (YTM solo expone texto plano en el DOM) y hay que mantenerlo contra un sitio
  que cambia.
- **Fork de BridgeThing para implementar `Provider::lyrics()` en `system_media`** — te
  integra en la UI stock, pero exige compilar y mantener el companion propio contra
  un proyecto que se mueve rápido. Solo si la webapp no alcanza.
- **Bluetooth desde el Mac** — el companion de escritorio implementa únicamente el
  transporte de red (0 referencias a bluetooth/rfcomm en `desktop/src-tauri/src`);
  RFCOMM es la vía del teléfono. Es por cable, y el cable además alimenta el device.

## Fundamento (verificado en código)

| Pregunta | Respuesta | Evidencia |
|---|---|---|
| ¿Cómo llega el now-playing de YTM? | Chrome publica al Now Playing de macOS; el helper lee cualquier cliente MediaRemote (procesos WebKit se remapean al padre; Chrome = `com.google.Chrome`) con `title / trackArtistName / albumName / duration / elapsedTime / elapsedTimeTimestamp / playbackRate / artworkIdentifier` y cola. | `desktop/src-tauri/macos/mediaremote-helper.m:229-240, 399-425` |
| ¿`system_media` filtra a Chrome? | No. Solo excluye bundles que ya tienen provider propio (Spotify/Apple Music) y elige la sesión `playing`. | `crates/companion/src/provider/system_media.rs:73-85` |
| ¿Se puede controlar (play/pause/next/prev/seek)? | Sí: `PlayerTransport` de `system_media` → `MediaControl` → `MRMediaRemoteSendCommand`. | `system_media.rs:320-377`, `mediaremote-helper.m:618` |
| ¿Hay lyrics en BridgeThing? | El wire type existe (`Lyrics{synced:[{startMs,text}], plain, source}`) y `client.lyrics.get` existe, pero `system_media::lyrics()` devuelve `Ok(None)`. | `crates/lib/src/shared/lyrics.rs`, `system_media.rs:446` |
| ¿La webapp puede pegarle a LRCLIB? | Sí: `client.net.fetch` tunelea HTTP por el host sin permiso especial (solo SOCKS pide `net.proxy`). | `packages/create-bridgething/template/_claude/skills/bridgething/reference/sdk.md:141-143` |
| ¿Cómo se sincroniza la posición? | `PlayerState.positionMs` + `positionAgeMs`; la webapp avanza el playhead localmente mientras está `playing`. | `crates/lib/src/shared/player.rs:181-190` |
| ¿Cómo se renderiza? | Chromium 147 kiosk a 800×480; la webapp es Vite+React+Tailwind a pantalla completa, se instala como cualquier app del catálogo. | `bridgething.com`, `bun create bridgething` |
| ¿Cómo llegan los controles físicos? | Como eventos DOM: preset 1–4 = `Digit1..4`, botón M = `KeyM`, back = `Escape`, **click del dial = `Enter`** (`KEY_ENTER`), rotación = `wheel` con `deltaX` (`REL_HWHEEL`). Touch = pointer events. El daemon no hace grab del evdev; solo escucha el gesto de hub (M) y nav del browser. | `yocto-superbird/.../meson-g12a-superbird.dts:166-244`, `crates/core/src/input/evdev_listener.rs`, `reference/develop.md:157-163` |
| ¿MediaRemote funciona en macOS 27 beta? | **Sí.** El helper del repo compilado localmente y cargado con el mismo `perl DynaLoader` que usa la app leyó la PWA de YTM en Safari: `package=com.apple.Safari.WebApp.<uuid>`, `title`, `artist`, `durationMs=204000`, `elapsedMs`, `timestampUnixMs`, `rate=1`, `playing=true`, `artworkId`, y `commands=[play, pause, next, prev, seek]`. | ejecución local 2026-09-18 21:40 |
| ¿Safari o Chrome? | Cualquiera. Safari está contemplado explícitamente (procesos `com.apple.WebKit.*` → bundle padre); la PWA de Safari aparece con su propio bundle `com.apple.Safari.WebApp.*`, que `system_media` no excluye. Verificado con la PWA. | `mediaremote-helper.m:233-237`, ejecución local |

## Diseño de la webapp

- **Datos**: `client.player.subscribe` → snapshot/delta. Cambio de track → `net.fetch`
  `GET https://lrclib.net/api/get?track_name&artist_name&duration` **sin `album_name`**
  (YTM vía Safari reporta `album == title`, verificado; mandarlo rompe el match
  exacto), fallback a `/api/search`; parse LRC (`[mm:ss.xx]`) → `LyricLine[]`. Cache
  en memoria por `(title, artist, durationMs)`. Normalizar título/artista antes de
  buscar (`(Official Video)`, `(Acoustic version)`, `- Topic`, `feat.`), porque YTM
  en browser los reporta sucios.
- **Controles disponibles**: la PWA anuncia play/pause/next/prev/seek. No anuncia
  like, shuffle ni repeat — no van en la UI.
- **Reloj**: loop `rAF`, `pos = positionMs + (now − tSnapshot) + offsetUsuario` mientras
  `playing`; línea actual = última con `startMs ≤ pos` (índice cacheado, no búsqueda
  lineal por frame).
- **UI**: banda superior ~90px (artwork 64px, título, artista, barra de progreso);
  área de lyrics con 3–5 líneas, la actual centrada y grande (≥40px), vecinas en gris.
  Solo `transform`/`opacity` en animaciones — el S905D3 es modesto. Sin lyrics
  sincronizadas: `plain` estático; sin nada: solo el player.
- **Inputs**: `Enter` = play/pause, `Digit1`/`Digit4` = prev/next, `wheel.deltaX` =
  offset ±100 ms (persistido en `client.store`), tap en la banda = play/pause.
- **Tamaño**: ~350–500 LOC TS/TSX + ~100–150 de tests (parser LRC y búsqueda de línea
  son lógica pura; ahí van los tests).

## Consecuencias

- **Heredo el riesgo de MediaRemote**: es API privada y el helper se autodeshabilita
  por etapa según build de macOS. Si Apple lo rompe, se cae el control para todo el
  companion, no solo mi feature. Es deuda del proyecto, no mía, pero me afecta.
- **Precisión de sync**: dos hops (Chrome→MediaRemote→USB). Esperable ±300–500 ms, a
  nivel línea, nunca palabra. El offset manual con el dial es parte del diseño, no un
  parche.
- **Dependencia de LRCLIB**: gratuito, sin key, cobertura variable. Matching sucio de
  metadatos es el modo de falla más probable; la normalización es la mitigación.
- **Sin blast radius**: no toca dinero ni datos de clientes; una webapp instalable y
  desinstalable desde el companion. Rollback = desinstalar.

## Criterio de aceptación

1. **Paso 0 (antes de escribir la webapp)**: companion instalado, Car Thing por USB,
   YTM sonando en Chrome → el hub muestra el track y `Enter`/next/prev responden.
2. Webapp instalada: en 3 canciones de prueba con lyrics en LRCLIB, la línea resaltada
   coincide con lo que suena dentro de ±500 ms tras ajustar offset una vez.
3. Canción sin lyrics: se muestra el player sin error y sin pantalla vacía.
4. Cambio de track y pausa/resume no desincronizan (la línea vuelve a coincidir sin
   recargar).

## Extensión futura (solo con evidencia)

Si el paso 0 muestra que MediaRemote lee mal a Chrome, o si la normalización/cache
conviene hacerla en disco, la pieza del lado Mac es una **extensión Deno del
companion** declarada en el `manifest.json` de la misma webapp (`template-extension`,
permisos `net:lrclib.net`), no un proceso aparte.
