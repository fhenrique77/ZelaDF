/**
 * Reverse geocoding via Nominatim (OpenStreetMap) — gratuito, 1 req/s.
 * Detecta automaticamente a Região Administrativa e endereço a partir de coordenadas.
 */

import { logger } from "./observability"

// Mapeamento de nomes que o Nominatim pode retornar para o nome oficial da RA
const RA_ALIASES: Record<string, string> = {
  // Plano Piloto e subdivisões
  "plano piloto": "Plano Piloto",
  brasilia: "Plano Piloto",
  "asa sul": "Asa Sul",
  "asa norte": "Asa Norte",
  // RAs numeradas
  gama: "Gama",
  taguatinga: "Taguatinga",
  brazlândia: "Brazlândia",
  brazlandia: "Brazlândia",
  sobradinho: "Sobradinho",
  "sobradinho ii": "Sobradinho II",
  "sobradinho 2": "Sobradinho II",
  planaltina: "Planaltina",
  paranoá: "Paranoá",
  paranoa: "Paranoá",
  "núcleo bandeirante": "Núcleo Bandeirante",
  "nucleo bandeirante": "Núcleo Bandeirante",
  ceilândia: "Ceilândia",
  ceilandia: "Ceilândia",
  guará: "Guará",
  guara: "Guará",
  cruzeiro: "Cruzeiro",
  samambaia: "Samambaia",
  "santa maria": "Santa Maria",
  "são sebastião": "São Sebastião",
  "sao sebastiao": "São Sebastião",
  "recanto das emas": "Recanto das Emas",
  "lago sul": "Lago Sul",
  "lago norte": "Lago Norte",
  "riacho fundo": "Riacho Fundo",
  "riacho fundo ii": "Riacho Fundo II",
  "riacho fundo 2": "Riacho Fundo II",
  candangolândia: "Candangolândia",
  candangolandia: "Candangolândia",
  "águas claras": "Águas Claras",
  "aguas claras": "Águas Claras",
  "sudoeste/octogonal": "Sudoeste/Octogonal",
  sudoeste: "Sudoeste/Octogonal",
  octogonal: "Sudoeste/Octogonal",
  varjão: "Varjão",
  varjao: "Varjão",
  "park way": "Park Way",
  parkway: "Park Way",
  scia: "SCIA",
  "estrutural": "SCIA",
  "cidade estrutural": "SCIA",
  sia: "SIA",
  "jardim botânico": "Jardim Botânico",
  "jardim botanico": "Jardim Botânico",
  itapoã: "Itapoã",
  itapoa: "Itapoã",
  "vicente pires": "Vicente Pires",
  fercal: "Fercal",
  "sol nascente": "Sol Nascente/Pôr do Sol",
  "pôr do sol": "Sol Nascente/Pôr do Sol",
  "por do sol": "Sol Nascente/Pôr do Sol",
  "sol nascente/pôr do sol": "Sol Nascente/Pôr do Sol",
  arniqueira: "Arniqueira",
  "26 de setembro": "26 de Setembro",
  "ponte alta": "Ponte Alta",
}

export type GeoResult = {
  ra: string
  address: string
}

// Cache simples em memória para evitar chamadas repetidas
const cache = new Map<string, GeoResult>()

function cacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(4)},${lng.toFixed(4)}`
}

/**
 * Tenta resolver o nome da RA a partir dos campos retornados pelo Nominatim.
 * O Nominatim não tem um campo "região administrativa" — a RA pode aparecer
 * em suburb, city_district, town, village, neighbourhood etc.
 */
function resolveRA(addr: Record<string, string>): string {
  const candidates = [
    addr.suburb,
    addr.city_district,
    addr.town,
    addr.village,
    addr.neighbourhood,
    addr.quarter,
    addr.municipality,
  ].filter(Boolean)

  for (const raw of candidates) {
    const key = raw.toLowerCase().trim()
    if (RA_ALIASES[key]) return RA_ALIASES[key]
  }

  // Fallback: retorna o primeiro candidato encontrado ou "Brasília"
  return candidates[0] ?? "Brasília"
}

function buildAddress(addr: Record<string, string>): string {
  // Tenta montar um endereço legível a partir dos campos do Nominatim
  const parts = [addr.road, addr.house_number].filter(Boolean)
  if (parts.length > 0) return parts.join(", ")

  // Fallback para display_name sem os últimos campos (estado, país, CEP)
  return [addr.suburb, addr.city_district, addr.neighbourhood]
    .filter(Boolean)
    .join(", ") || "Endereço não identificado"
}

let lastRequestTime = 0

/**
 * Reverse geocoding: coordenadas → { ra, address }
 * Respeita rate limit de 1 req/s do Nominatim.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<GeoResult> {
  const key = cacheKey(lat, lng)
  const cached = cache.get(key)
  if (cached) return cached

  // Rate limit — espera pelo menos 1s entre chamadas
  const now = Date.now()
  const elapsed = now - lastRequestTime
  if (elapsed < 1100) {
    await new Promise((r) => setTimeout(r, 1100 - elapsed))
  }
  lastRequestTime = Date.now()

  try {
    const url = new URL("https://nominatim.openstreetmap.org/reverse")
    url.searchParams.set("lat", lat.toString())
    url.searchParams.set("lon", lng.toString())
    url.searchParams.set("format", "json")
    url.searchParams.set("addressdetails", "1")
    url.searchParams.set("accept-language", "pt-BR")

    const res = await fetch(url.toString(), {
      headers: {
        "User-Agent": "ZelaDF/1.0 (mapa cidadão do DF; contato@zeladf.app)",
      },
    })

    if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`)

    const data = await res.json()
    const addr = data.address ?? {}

    const result: GeoResult = {
      ra: resolveRA(addr),
      address: buildAddress(addr),
    }

    cache.set(key, result)
    return result
  } catch (err) {
    logger.warn("geocoding.reverse_failed", {
      error: err,
      operation: "reverse",
    })
    return { ra: "", address: "" }
  }
}
