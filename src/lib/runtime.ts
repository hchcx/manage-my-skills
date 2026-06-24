export function isTauriRuntime() {
  return "__TAURI_INTERNALS__" in window;
}
