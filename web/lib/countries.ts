// [código ISO, nombre, prefijo, bandera]
export const COUNTRIES: [string, string, string, string][] = [
  ["PE", "Perú", "51", "🇵🇪"], ["AR", "Argentina", "54", "🇦🇷"], ["BO", "Bolivia", "591", "🇧🇴"], ["BR", "Brasil", "55", "🇧🇷"],
  ["CL", "Chile", "56", "🇨🇱"], ["CO", "Colombia", "57", "🇨🇴"], ["CR", "Costa Rica", "506", "🇨🇷"], ["CU", "Cuba", "53", "🇨🇺"],
  ["EC", "Ecuador", "593", "🇪🇨"], ["SV", "El Salvador", "503", "🇸🇻"], ["ES", "España", "34", "🇪🇸"], ["US", "Estados Unidos", "1", "🇺🇸"],
  ["GT", "Guatemala", "502", "🇬🇹"], ["HN", "Honduras", "504", "🇭🇳"], ["MX", "México", "52", "🇲🇽"], ["NI", "Nicaragua", "505", "🇳🇮"],
  ["PA", "Panamá", "507", "🇵🇦"], ["PY", "Paraguay", "595", "🇵🇾"], ["DO", "Rep. Dominicana", "1", "🇩🇴"], ["UY", "Uruguay", "598", "🇺🇾"], ["VE", "Venezuela", "58", "🇻🇪"],
];

// separa "+54 (36) 24027746" en país y número nacional (prefijo más largo que coincida)
export function splitPhone(raw: string): { cc: string; national: string } {
  const digits = raw.replace(/\D/g, "");
  if (!raw.trim().startsWith("+") || !digits) return { cc: "PE", national: digits };
  const hit = [...COUNTRIES].filter((c) => digits.startsWith(c[2])).sort((a, b) => b[2].length - a[2].length)[0];
  return hit ? { cc: hit[0], national: digits.slice(hit[2].length) } : { cc: "PE", national: digits };
}


// El número de un vendedor es su usuario: Supabase Auth lo guarda como un correo interno (igual que en la función admin-users).
export const SELLER_DOMAIN = "vendedor.crm";
export const sellerEmail = (digits: string) => `${digits.replace(/\D/g, "")}@${SELLER_DOMAIN}`;
