/** Cheap, dependency-free check — kept out of pdfReceipt.ts so picking a
 * plain photo never pulls the (large) PDF.js chunk into the bundle. */
export function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
}
