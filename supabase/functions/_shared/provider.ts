// Envío de texto por Evolution API
export type ChannelCreds = { api_url: string | null; api_key: string | null; instance_name: string | null };

export async function sendText(ch: ChannelCreds, phone: string, text: string): Promise<void> {
  if (!ch.api_url || !ch.api_key || !ch.instance_name) throw new Error("canal sin credenciales");
  const r = await fetch(`${ch.api_url.replace(/\/$/, "")}/message/sendText/${ch.instance_name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ch.api_key },
    body: JSON.stringify({ number: phone.replace(/\D/g, ""), text }),
  });
  if (!r.ok) throw new Error(`proveedor respondió ${r.status}`);
}
