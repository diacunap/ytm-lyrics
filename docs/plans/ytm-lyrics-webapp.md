# Plan — webapp `ytm-lyrics` (player mínimo + lyrics sincronizadas)

- Decisión de fondo: [ADR 0001](../decisions/0001-ytm-lyrics-webapp-sobre-bridgething.md) (aceptado)
- Fecha: 2026-09-18
- Estado: en ejecución

## Estado de la fase 0 (cadena oficial, sin código propio)

| Paso | Estado | Evidencia |
|---|---|---|
| Companion macOS instalado | hecho | `bridgething_0.13.1_aarch64.dmg`, sha256 `f330d0a9…071ed` OK, Developer ID + notarizado, en `/Applications` |
| Companion ↔ Car Thing por USB | hecho | `lsof`: `10.42.1.124:63175 → 10.42.1.122:8892 ESTABLISHED`; mDNS `bridgething-q312`, serial `8556R98PQ312` |
| Helper MediaRemote lee YTM (PWA Safari) | hecho | título/artista/duración/elapsed/timestamp/comandos, macOS 27 beta |
| Hub muestra el track y el dial pausa | **pendiente: confirmación visual del usuario** | — |
| Shell con permiso "Red local" | **pendiente: usuario** | `No route to host` desde WezTerm hacia `10.42.1.122` |

## Scaffold

`bun create bridgething ytm-lyrics --yes` → workspace en `ytm-lyrics/`, app en
`ytm-lyrics/apps/ytm-lyrics/` (id `01a0b7ff-16b7-726e-9555-0719b9d96665`, nunca cambiarlo).
Preact + React 19 compat, Tailwind 4, Vite 8, `@bridgething/client` 0.12.1.

## Módulos (todos en `apps/ytm-lyrics/src/`)

| Archivo | Responsabilidad | Test |
|---|---|---|
| `lib/lrc.ts` | `parseLrc(text) → LyricLine[]` ordenadas por `startMs`; soporta `[mm:ss.xx]`, `[mm:ss.xxx]`, múltiples timestamps por línea, ignora tags `[ar:]`/`[ti:]` | sí, `bun test` |
| `lib/sync.ts` | `projectPosition(snapshot, now, offset)` y `lineIndexAt(lines, posMs)` (binary search, `-1` si antes de la primera) | sí |
| `lib/normalize.ts` | limpieza de título/artista de YTM: `(Official Video)`, `[Lyrics]`, `- Topic`, `feat.`… | sí |
| `lib/lrclib.ts` | `lookup(fetch, {title, artist, durationMs})`: `/api/get` sin `album_name` → fallback `/api/search` eligiendo por duración ±3 s; devuelve `Lyrics` del wire type | sí, con `fetch` fake |
| `lib/net.ts` | adapta `client.net.fetch` a una firma `(url) → {status, text}` | no (glue) |
| `usePlayer.ts` | `stateGet` + `onSnapshot`; guarda `{state, receivedAt}` | no (glue) |
| `useLyrics.ts` | cache por `(title, artist, durationMs)`, estados `idle/loading/found/none/error` | no (glue) |
| `useOffset.ts` | offset en ms persistido en `client.store` (`sync-offset-ms`) | no (glue) |
| `App.tsx` | layout 800×480: banda de player + lista de lyrics; `rAF` loop; teclas `Enter`/`1`/`4`/`Escape`, `wheel.deltaX` para offset | manual en device |

Presupuesto: ~400–500 LOC de app + ~120 de tests. **Real: 517 LOC de app, 219 de tests
(41 casos, `bun test src/lib`), `bun run typecheck` y `bun run check` en verde. Bundle
`ytm-lyrics-0.1.0.zip` (835 KiB) generado con `bun run share`.**

Hallazgos durante la implementación (ya reflejados en `lib/lrclib.ts`):
- LRCLIB `/api/get` devuelve **503 ServerOverloaded** con frecuencia → cualquier no-200 cae a
  `/api/search`, no solo 404.
- `/api/search` devuelve ~20 versiones del mismo tema con duraciones distintas (187–328 s
  para "Where Our Blue Is"); se elige por `|duration − durationMs/1000| ≤ 3 s`, prefiriendo
  synced. La de 204 s coincide con lo que reporta la PWA.
- `bun-types` agregado como devDependency (solo tipos) + `"types": ["bun-types"]` en tsconfig
  para que `tsc` acepte `bun:test`.

Pendiente de validación en device (bloqueado por permiso "Red local" de la shell):
`bun run push` y los criterios 2–4.

## Reglas de implementación

- Solo `transform`/`opacity` en animaciones; el S905D3 es modesto.
- `rAF` solo actualiza el índice de línea y la barra de progreso; nada de re-render por frame de la lista completa.
- Sin `album_name` en LRCLIB (YTM reporta `album == title`).
- `Escape` no se intercepta (lo usa el sistema para volver); `m` tampoco.
- Sin dependencias nuevas fuera del scaffold.

## Criterio de aceptación (del ADR)

1. Fase 0 visual: hub muestra el track de la PWA; click del dial pausa.
2. 3 canciones con lyrics en LRCLIB: línea correcta en ±500 ms tras ajustar offset una vez.
3. Canción sin lyrics: player visible, sin error ni pantalla vacía.
4. Cambio de track y pausa/resume no desincronizan.

Verificación: `bun test` (módulos puros), `bun run check` (gate del workspace), `bun run push`
al device y screenshot del kiosk (`bun run shot`) en las 3 canciones.

## Rollback

Desinstalar la webapp desde el companion. No toca nada fuera de su namespace KV.
