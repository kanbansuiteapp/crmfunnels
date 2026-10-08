const COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#8b5cf6", "#e87ba4", "#0f766e", "#b45309"];

export const colorOf = (s: string) => COLORS[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];
export const initials = (n: string) =>
  n.replace(/[^\p{L}\p{N} ]/gu, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "#";

export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, background: colorOf(name), fontSize: size * 0.36 }}
    >
      {initials(name)}
    </span>
  );
}
