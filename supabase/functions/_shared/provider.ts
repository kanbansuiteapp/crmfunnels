// Envío de texto por Evolution API
export type ChannelCreds = { api_url: string | null; api_key: string | null; instance_name: string | null };

export async function sendText(ch: ChannelCreds, phone: string, text: string): Promise<void> {
  if (!ch.api_url || !ch.api_key || !ch.instance_name) throw new Error("canal sin credenciales");
  const r = await fetch(`${ch.api_url.replace(/\/$/, "")}/message/sendText/${ch.instance_name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ch.api_key },
    body: JSON.stringify({ number: phone.includes("@") ? phone : phone.replace(/\D/g, ""), text }),
  });
  if (!r.ok) throw new Error(`proveedor respondió ${r.status}`);
}

export type MediaType = "image" | "audio" | "video" | "document" | "sticker";

export const mediaTypeOf = (mime: string): MediaType =>
  mime.startsWith("image/") ? "image" : mime.startsWith("audio/") ? "audio" : mime.startsWith("video/") ? "video" : "document";

// base64 por trozos: evita desbordar la pila con archivos grandes
export function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function fromBase64(b64: string): Uint8Array {
  const clean = b64.includes(",") ? b64.slice(b64.indexOf(",") + 1) : b64; // quita "data:...;base64,"
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Envía imagen, video, documento o nota de voz. Los audios van como nota de voz (Evolution los convierte a ogg/opus).
export async function sendMedia(
  ch: ChannelCreds, phone: string,
  m: { type: MediaType; mime: string; name: string; base64: string; caption?: string },
): Promise<void> {
  if (!ch.api_url || !ch.api_key || !ch.instance_name) throw new Error("canal sin credenciales");
  const base = `${ch.api_url.replace(/\/$/, "")}/message`;
  const number = phone.replace(/\D/g, "");
  const isAudio = m.type === "audio";
  const r = await fetch(`${base}/${isAudio ? "sendWhatsAppAudio" : "sendMedia"}/${ch.instance_name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ch.api_key },
    body: JSON.stringify(
      isAudio
        ? { number, audio: m.base64, encoding: true }
        : { number, mediatype: m.type === "sticker" ? "image" : m.type, mimetype: m.mime, caption: m.caption ?? "", media: m.base64, fileName: m.name },
    ),
    signal: AbortSignal.timeout(60_000),
  });
  if (!r.ok) throw new Error(`proveedor respondió ${r.status}`);
}

// Descarga un medio recibido desde Evolution (devuelve bytes y tipo)
export async function fetchIncomingMedia(
  ch: ChannelCreds, messageKeyId: string, inlineBase64?: string, inlineMime?: string,
): Promise<{ bytes: Uint8Array; mime: string; name?: string }> {
  if (inlineBase64) return { bytes: fromBase64(inlineBase64), mime: inlineMime ?? "application/octet-stream" };
  if (!ch.api_url || !ch.api_key || !ch.instance_name) throw new Error("canal sin credenciales");
  const r = await fetch(`${ch.api_url.replace(/\/$/, "")}/chat/getBase64FromMediaMessage/${ch.instance_name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ch.api_key },
    body: JSON.stringify({ message: { key: { id: messageKeyId } }, convertToMp4: false }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) throw new Error(`proveedor respondió ${r.status}`);
  const j = await r.json();
  if (!j?.base64) throw new Error("el proveedor no devolvió el archivo");
  return { bytes: fromBase64(j.base64), mime: j.mimetype ?? inlineMime ?? "application/octet-stream", name: j.fileName };
}
