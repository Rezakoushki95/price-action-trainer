/**
 * Native entry. Skia is already linked in a dev build, so the game mounts directly.
 * The web entry (App.web.tsx) has to wait for CanvasKit to download first.
 */
export { default } from './src/Game';
