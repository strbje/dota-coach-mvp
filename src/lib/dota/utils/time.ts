export function formatGameTime(totalSeconds: number): string {
  const sign = totalSeconds < 0 ? '-' : '';
  const abs = Math.abs(Math.trunc(totalSeconds));
  const minutes = Math.floor(abs / 60);
  const seconds = abs % 60;

  return `${sign}${minutes}:${seconds.toString().padStart(2, '0')}`;
}
