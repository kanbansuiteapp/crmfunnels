// color de cada etapa por su nombre (con respaldo por posición para etapas personalizadas)
const BY_NAME: Record<string, string> = { nuevo: "#4fa8ec", contactado: "#ebb740", propuesta: "#8c5ae8", ganado: "#5cc15c", perdido: "#ef4d5f" };
const FALLBACK = ["#4fa8ec", "#ebb740", "#8c5ae8", "#5cc15c", "#ef4d5f", "#67d6c3", "#ee7d2b", "#9aa5b8"];

export const stageColor = (name: string, index: number) =>
  BY_NAME[name.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase()] ?? FALLBACK[index % FALLBACK.length];
