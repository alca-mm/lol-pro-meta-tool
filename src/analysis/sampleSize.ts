export function sampleSizeLabel(n: number): string {
  if (n < 5) return "sample_veryLow"
  if (n < 10) return "sample_low"
  if (n < 25) return "sample_moderate"
  return "sample_good"
}
