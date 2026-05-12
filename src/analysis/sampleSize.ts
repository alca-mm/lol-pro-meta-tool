export function sampleSizeLabel(n: number): string {
  if (n < 5) return "sehr geringe Aussagekraft"
  if (n < 10) return "geringe Aussagekraft"
  if (n < 25) return "brauchbarer Trend"
  return "stabilerer Trend"
}
