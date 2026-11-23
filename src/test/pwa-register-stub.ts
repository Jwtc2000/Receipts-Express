// Stands in for vite-plugin-pwa's virtual module, which only exists inside a
// Vite build. Tests that render UpdateBanner mock it; this keeps the import
// resolvable so they can.
export function registerSW(): (reload?: boolean) => Promise<void> {
  return () => Promise.resolve()
}
