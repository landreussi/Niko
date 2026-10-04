import { useEffect, useState } from "react";
import type { Rota, ServicoId } from "../tipos";

export type NomeJanela = "sistema" | "ilha" | "dock";

interface InternosTauri {
  metadata?: { currentWindow?: { label?: string } };
}

const internos = typeof window !== "undefined" ? (window as unknown as { __TAURI_INTERNALS__?: InternosTauri }).__TAURI_INTERNALS__ : undefined;

export const NATIVO = Boolean(internos);

export const JANELA: NomeJanela | null = NATIVO ? ((internos?.metadata?.currentWindow?.label as NomeJanela | undefined) ?? "sistema") : null;

export type Comando =
  | { tipo: "irPara"; rota: Rota; parametros?: Record<string, string> }
  | { tipo: "abrirConexao"; id: ServicoId }
  | { tipo: "abrirBusca" }
  | { tipo: "abrirCaptura" };

const canal = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("niko-comandos") : null;

export function enviarComando(c: Comando) {
  canal?.postMessage(c);
  void mostrarSistema();
}

export function ouvirComandos(fn: (c: Comando) => void): () => void {
  if (!canal) return () => undefined;
  const aoReceber = (e: MessageEvent<Comando>) => fn(e.data);
  canal.addEventListener("message", aoReceber);
  return () => canal.removeEventListener("message", aoReceber);
}

export function foraDoSistema(): boolean {
  return NATIVO && JANELA !== "sistema";
}

async function invocar<T>(comando: string, args?: Record<string, unknown>): Promise<T | null> {
  if (!NATIVO) return null;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<T>(comando, args);
  } catch {
    return null;
  }
}

function ehLinkExterno(url: string): boolean {
  return /^https?:\/\//i.test(url) && !url.startsWith(window.location.origin);
}

export function abrirLink(url: string) {
  if (!ehLinkExterno(url)) return;
  if (NATIVO) void invocar("abrir_link", { url });
  else window.open(url, "_blank", "noopener,noreferrer");
}

export function desviarLinksExternos() {
  if (!NATIVO) return;
  document.addEventListener(
    "click",
    (e) => {
      const link = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!link || !ehLinkExterno(link.href)) return;
      e.preventDefault();
      abrirLink(link.href);
    },
    true,
  );
}

export function mostrarSistema() {
  return invocar("mostrar_sistema");
}

export function informarAreaInterativa(retangulos: { x: number; y: number; w: number; h: number }[]) {
  return invocar("area_interativa", { janela: JANELA, retangulos });
}

export async function janelaAtual() {
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  return getCurrentWindow();
}

export async function ouvirEvento(nome: string, fn: () => void): Promise<() => void> {
  if (!NATIVO) return () => undefined;
  const { listen } = await import("@tauri-apps/api/event");
  return listen(nome, fn);
}

export async function prepararPonte() {
  if (!NATIVO || window.location.hostname !== "tauri.localhost") return;
  const [token, porta] = await Promise.all([invocar<string>("token_ponte"), invocar<number>("porta_ponte")]);
  const base = `http://127.0.0.1:${porta ?? 47831}`;
  const original = window.fetch.bind(window);
  window.fetch = (entrada: RequestInfo | URL, opcoes?: RequestInit) => {
    if (typeof entrada === "string" && entrada.startsWith("/ponte")) {
      const cabecalhos = new Headers(opcoes?.headers);
      if (token) cabecalhos.set("x-niko-token", token);
      return original(`${base}${entrada}`, { ...opcoes, headers: cabecalhos });
    }
    return original(entrada, opcoes);
  };
}

export async function sincronizarInicioComWindows(ligado: boolean) {
  if (!NATIVO) return;
  try {
    const { enable, disable, isEnabled } = await import("@tauri-apps/plugin-autostart");
    const atual = await isEnabled();
    if (ligado && !atual) await enable();
    if (!ligado && atual) await disable();
  } catch {
    return;
  }
}

export function usarAreaInterativa(seletores: string[]) {
  const chaveSeletores = seletores.join(",");
  useEffect(() => {
    if (!NATIVO) return;
    let anterior = "";
    const medir = () => {
      const retangulos = [...document.querySelectorAll(chaveSeletores)]
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.width > 0 && r.height > 0)
        .map((r) => ({ x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }));
      const atual = JSON.stringify(retangulos);
      if (atual === anterior) return;
      anterior = atual;
      void informarAreaInterativa(retangulos);
    };
    medir();
    const t = window.setInterval(medir, 90);
    return () => window.clearInterval(t);
  }, [chaveSeletores]);
}

export function usarCursorFora(fn: () => void) {
  useEffect(() => {
    if (!NATIVO) return;
    let desligar: () => void = () => undefined;
    let ativo = true;
    void ouvirEvento("niko://cursor-fora", fn).then((f) => {
      if (ativo) desligar = f;
      else f();
    });
    return () => {
      ativo = false;
      desligar();
    };
  }, [fn]);
}
export interface AppAberto {
  id: string;
  pid: number;
  titulo: string;
  minimizada: boolean;
  ativa: boolean;
  app: string;
  nome: string;
  caminho: string | null;
  icone: string | null;
}

export function usarAppsAbertos(ativo: boolean): [AppAberto[], () => void] {
  const [apps, setApps] = useState<AppAberto[]>([]);
  const [versao, setVersao] = useState(0);
  useEffect(() => {
    if (!NATIVO || !ativo) return;
    let vivo = true;
    const ler = async () => {
      try {
        const r = await fetch("/ponte/janelas", { headers: { "x-niko": "1" } });
        if (!r.ok) return;
        const j = (await r.json()) as { janelas?: AppAberto[] | AppAberto };
        const lista = Array.isArray(j.janelas) ? j.janelas : j.janelas ? [j.janelas] : [];
        if (vivo) setApps(lista);
      } catch {
        return;
      }
    };
    void ler();
    const t = window.setInterval(() => void ler(), 2000);
    return () => {
      vivo = false;
      window.clearInterval(t);
    };
  }, [ativo, versao]);
  return [apps, () => setVersao((v) => v + 1)];
}

export interface AreaMiniatura {
  janela: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export function mostrarMiniaturas(itens: AreaMiniatura[]) {
  return invocar("miniaturas_janelas", { itens });
}

export function ocultarBarraDoWindows(ocultar: boolean) {
  return invocar("barra_windows", { ocultarBarra: ocultar });
}

export function reservarEspacoDoDock(reservar: boolean) {
  return invocar("reservar_dock", { reservar });
}

export type TipoDaFrente = "area_de_trabalho" | "sobreposta" | "app";

export interface EstadoDaFrente {
  cobre: boolean;
  telaCheia: boolean;
  frente: TipoDaFrente;
}

const FRENTE_LIVRE: EstadoDaFrente = { cobre: false, telaCheia: false, frente: "area_de_trabalho" };

export function usarEstadoDaFrente(ativo: boolean): EstadoDaFrente {
  const [estado, setEstado] = useState<EstadoDaFrente>(FRENTE_LIVRE);
  useEffect(() => {
    if (!NATIVO || !ativo) {
      setEstado(FRENTE_LIVRE);
      return;
    }
    let vivo = true;
    const ler = async () => {
      const r = await invocar<EstadoDaFrente>("frente_cobre_tela");
      if (!vivo) return;
      const cobre = Boolean(r?.cobre);
      const telaCheia = Boolean(r?.telaCheia);
      const frente: TipoDaFrente = r?.frente === "app" || r?.frente === "sobreposta" ? r.frente : "area_de_trabalho";
      setEstado((anterior) => (anterior.cobre === cobre && anterior.telaCheia === telaCheia && anterior.frente === frente ? anterior : { cobre, telaCheia, frente }));
    };
    void ler();
    const t = window.setInterval(() => void ler(), 800);
    return () => {
      vivo = false;
      window.clearInterval(t);
    };
  }, [ativo]);
  return estado;
}

export async function agirNaJanela(acao: "focar" | "minimizar" | "fechar", id: string) {
  try {
    await fetch(`/ponte/janelas/${acao}`, { method: "POST", headers: { "x-niko": "1", "content-type": "application/json" }, body: JSON.stringify({ janela: id }) });
  } catch {
    return;
  }
}

export function alternarSistemaNativo() {
  return invocar("alternar_sistema");
}