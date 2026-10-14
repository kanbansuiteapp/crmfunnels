// Datos PÚBLICOS de la app de Meta (no son secretos). El secreto de la app vive solo en los secretos de Supabase (META_APP_SECRET).
export const META_APP_ID = process.env.NEXT_PUBLIC_META_APP_ID ?? "1350768843578933";
export const META_CONFIG_ID = process.env.NEXT_PUBLIC_META_CONFIG_ID ?? "1336210358399020";
export const META_GRAPH_VERSION = "v25.0";

type FB = { init: (o: object) => void; login: (cb: (r: { authResponse?: { code?: string } }) => void, o: object) => void };
declare global { interface Window { FB?: FB; fbAsyncInit?: () => void } }

let sdk: Promise<FB> | null = null;
export function loadFacebookSdk(): Promise<FB> {
  if (sdk) return sdk;
  sdk = new Promise((resolve, reject) => {
    window.fbAsyncInit = () => {
      window.FB!.init({ appId: META_APP_ID, autoLogAppEvents: true, xfbml: false, version: META_GRAPH_VERSION });
      resolve(window.FB!);
    };
    const s = document.createElement("script");
    s.src = "https://connect.facebook.net/es_LA/sdk.js";
    s.async = true;
    s.onerror = () => { sdk = null; reject(new Error("No se pudo cargar Facebook")); };
    document.body.appendChild(s);
  });
  return sdk;
}

// Abre el asistente de WhatsApp (registro insertado). Devuelve el código OAuth y los IDs de la cuenta y el número.
export async function embeddedSignup(): Promise<{ code: string; waba_id: string; phone_number_id: string }> {
  const FB = await loadFacebookSdk();
  return new Promise((resolve, reject) => {
    let ids: { waba_id?: string; phone_number_id?: string } = {};
    let code: string | undefined;
    const done = () => {
      if (code && ids.waba_id && ids.phone_number_id) { window.removeEventListener("message", onMsg); resolve({ code, waba_id: ids.waba_id, phone_number_id: ids.phone_number_id }); }
    };
    const onMsg = (e: MessageEvent) => {
      if (!/facebook\.com$/.test(new URL(e.origin).hostname)) return;
      try {
        const d = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
        if (d?.type !== "WA_EMBEDDED_SIGNUP") return;
        if (d.event === "FINISH" || d.event === "FINISH_ONLY_WABA") { ids = { waba_id: d.data?.waba_id, phone_number_id: d.data?.phone_number_id }; done(); }
        else if (d.event === "CANCEL") { window.removeEventListener("message", onMsg); reject(new Error("Cancelaste el proceso en Facebook.")); }
      } catch { /* mensaje ajeno */ }
    };
    window.addEventListener("message", onMsg);
    FB.login((r) => {
      if (!r.authResponse?.code) { window.removeEventListener("message", onMsg); return reject(new Error("No se completó el inicio de sesión con Facebook.")); }
      code = r.authResponse.code; done();
    }, { config_id: META_CONFIG_ID, response_type: "code", override_default_response_type: true, extras: { setup: {}, featureType: "", sessionInfoVersion: "3" } });
  });
}
