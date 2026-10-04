import { create } from "zustand";

export interface Faixa {
  titulo: string;
  artista: string;
  app: string;
  duracao: number;
  capa: string | null;
}

interface RespostaMidia {
  sessao: boolean;
  app?: string;
  titulo?: string;
  artista?: string;
  tocando?: boolean;
  posicao?: number;
  duracao?: number;
  capa?: string | null;
  podeAvancar?: boolean;
  podeVoltar?: boolean;
  podeBuscar?: boolean;
}

interface EstadoMidia {
  disponivel: boolean;
  faixa: Faixa | null;
  tocando: boolean;
  tocouPorUltimoEm: number;
  posicao: number;
  lidoEm: number;
  podeAvancar: boolean;
  podeVoltar: boolean;
  podeBuscar: boolean;
  sincronizar: () => Promise<void>;
  alternar: () => void;
  proxima: () => void;
  anterior: () => void;
  buscar: (segundos: number) => void;
}

const CABECALHOS = { "x-niko": "1", "content-type": "application/json" };

function mesmaFaixa(a: Faixa | null, b: Faixa): boolean {
  return Boolean(a) && a!.titulo === b.titulo && a!.artista === b.artista && a!.app === b.app && a!.duracao === b.duracao && a!.capa === b.capa;
}

function aplicar(r: RespostaMidia, anterior: Faixa | null): Partial<EstadoMidia> {
  if (!r.sessao || !r.titulo) return { disponivel: true, faixa: null, tocando: false, posicao: 0, lidoEm: Date.now() };
  const nova: Faixa = { titulo: r.titulo, artista: r.artista ?? "", app: nomeDoApp(r.app ?? ""), duracao: r.duracao ?? 0, capa: r.capa ?? null };
  return {
    disponivel: true,
    faixa: mesmaFaixa(anterior, nova) ? anterior : nova,
    tocando: Boolean(r.tocando),
    ...(r.tocando ? { tocouPorUltimoEm: Date.now() } : {}),
    posicao: r.posicao ?? 0,
    lidoEm: Date.now(),
    podeAvancar: Boolean(r.podeAvancar),
    podeVoltar: Boolean(r.podeVoltar),
    podeBuscar: Boolean(r.podeBuscar),
  };
}

function nomeDoApp(id: string): string {
  const base = id.split("!").pop()?.replace(/\.exe$/i, "") ?? id;
  if (/spotify/i.test(id)) return "Spotify";
  if (/chrome/i.test(id)) return "Chrome";
  if (/msedge|edge/i.test(id)) return "Edge";
  if (/firefox/i.test(id)) return "Firefox";
  if (/zen/i.test(id)) return "Zen";
  if (/^[0-9A-F]{16}$/i.test(base)) return "";
  return base;
}

async function pedir(caminho: string, corpo?: unknown): Promise<RespostaMidia | null> {
  try {
    const r = await fetch(`/ponte/midia${caminho}`, { method: corpo === undefined ? "GET" : "POST", headers: CABECALHOS, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
    if (!r.ok) return null;
    return (await r.json()) as RespostaMidia;
  } catch {
    return null;
  }
}

export const useMidia = create<EstadoMidia>()((set, get) => {
  const agir = async (acao: string, corpo: unknown = {}) => {
    const r = await pedir(`/${acao}`, corpo);
    if (r) set(aplicar(r, get().faixa));
  };
  return {
    disponivel: false,
    faixa: null,
    tocando: false,
    tocouPorUltimoEm: 0,
    posicao: 0,
    lidoEm: 0,
    podeAvancar: false,
    podeVoltar: false,
    podeBuscar: false,
    sincronizar: async () => {
      const r = await pedir("");
      if (r) set(aplicar(r, get().faixa));
      else if (get().disponivel) set({ disponivel: false, faixa: null, tocando: false });
    },
    alternar: () => {
      set((s) => ({ tocando: !s.tocando, tocouPorUltimoEm: Date.now(), posicao: posicaoAtual(s, Date.now()), lidoEm: Date.now() }));
      void agir("alternar");
    },
    proxima: () => void agir("proxima"),
    anterior: () => void agir("anterior"),
    buscar: (segundos) => {
      set({ posicao: segundos, lidoEm: Date.now() });
      void agir("posicao", { segundos });
    },
  };
});

const MIDIA_PAUSADA_NA_ILHA_MS = 5 * 60000;

export function midiaAtivaNaIlha(s: Pick<EstadoMidia, "faixa" | "tocando" | "tocouPorUltimoEm">, agora: number): boolean {
  return Boolean(s.faixa) && (s.tocando || agora - s.tocouPorUltimoEm < MIDIA_PAUSADA_NA_ILHA_MS);
}

export function posicaoAtual(s: Pick<EstadoMidia, "tocando" | "posicao" | "lidoEm" | "faixa">, agora: number): number {
  const duracao = s.faixa?.duracao ?? 0;
  const bruto = s.tocando ? s.posicao + (agora - s.lidoEm) / 1000 : s.posicao;
  return duracao > 0 ? Math.min(duracao, Math.max(0, bruto)) : Math.max(0, bruto);
}

const CAPAS: [string, string][] = [
  ["#f97316", "#7c2d12"],
  ["#38bdf8", "#1e3a8a"],
  ["#a78bfa", "#3b0764"],
  ["#34d399", "#064e3b"],
  ["#f472b6", "#831843"],
];

export function fundoDaCapa(faixa: Faixa | null): string {
  if (faixa?.capa) return `center / cover no-repeat url("${faixa.capa}")`;
  const [c1, c2] = capaDaFaixa(faixa);
  return `linear-gradient(135deg, ${c1}, ${c2})`;
}

export function capaDaFaixa(faixa: Faixa | null): [string, string] {
  const texto = faixa ? faixa.titulo + faixa.artista : "";
  let h = 0;
  for (let i = 0; i < texto.length; i++) h = (h * 31 + texto.charCodeAt(i)) >>> 0;
  return CAPAS[h % CAPAS.length];
}
