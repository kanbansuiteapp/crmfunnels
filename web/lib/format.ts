// 1.5 GB, 320 MB… (base 1024, igual que el límite del plan)
export function fmtBytes(b: number): string {
  if (b >= 1073741824) return `${(b / 1073741824).toFixed(b >= 10737418240 ? 0 : 1).replace(/\.0$/, "")} GB`;
  if (b >= 1048576) return `${Math.round(b / 1048576)} MB`;
  if (b >= 1024) return `${Math.round(b / 1024)} KB`;
  return `${b} B`;
}
export const fmtMB = (mb: number) => fmtBytes(mb * 1048576);
