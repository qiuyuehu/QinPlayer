# 2026-07-13 UI fixes batch

## Delivered

- Replaced the Mini queue native-only context menu with a transparent, theme-aware child window. It has a dedicated sandboxed preload and only accepts initialization, ready, and validated action-resolution IPC.
- Kept native Menu as the failure fallback for child-window creation, loading, and ready timeout. Escape, blur, view changes, Mini exit, and close resolve without showing a second menu.
- Expanded priority queue rows with cover, title, artist, duration, and remove control. The Liked empty state now uses the existing star icon.
- Added a guarded Playlist "play all" action and request-token handling so stale song loads cannot replace a newer selection.
- Made Mini mode non-resizable while active and restored normal resizability on exit.

## Validation

- `node harness/checks.js`
- `npx tsc --noEmit`
- `npm run verify`: production build passed; 53 test files and 518 tests passed.

## Manual acceptance remaining

- In Electron, verify the Mini menu at all four screen edges, across light/dark/system themes, reduced motion, high-DPI scaling, and multiple displays.
- Verify rapid repeated right-click, Escape, blur, view switching, and Mini exit do not execute a stale menu action.
- Verify priority-row layout, Liked empty state, Playlist play-all while loading/switching, and Mini resize transitions in the real application.
