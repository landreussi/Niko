import { readFileSync, readdirSync, statSync, existsSync, openSync, readSync, closeSync } from "node:fs";
import { join, basename } from "node:path";
import { homedir } from "node:os";

export interface JanelaUso {
  id: string;
  rotulo: string;
  usado: number;
  reiniciaEm?: string;
}

export interface UsoFerramenta {
  id: "claude" | "codex";
  nome: string;
  situacao: "ok" | "sem_login" | "erro" | "ausente";
  plano?: string;
  nota?: string;
  janelas: JanelaUso[];
}

export interface SessaoAtual {
  projeto: string;
  arquivo: string;
  modelo?: string;
  inicio?: string;
  ultimaAtividade: string;
  mensagens: number;
  entrada: number;
  saida: number;
  cacheCriado: number;
  cacheLido: number;
}

export interface Consumo {
  atualizadoEm: string;
  ferramentas: UsoFerramenta[];
  sessao: SessaoAtual | null;
}

const TEMPO_LIMITE = 10000;
let cache: { valor: Consumo; em: number } | null = null;

function lerJson(caminho: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(caminho, "utf8"));
  } catch {
    return null;
  }
}

function perfisClaude(): string[] {
  const casa = homedir();
  const perfis = [join(casa, ".claude")];
  try {
    for (const nome of readdirSync(casa)) if (nome.startsWith(".claude-")) perfis.push(join(casa, nome));
  } catch {
    return perfis;
  }
  return perfis.filter((p) => existsSync(p));
}

function porcentagem(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, n));
}

async function lerClaude(): Promise<UsoFerramenta> {
  const base: UsoFerramenta = { id: "claude", nome: "Claude Code", situacao: "ausente", janelas: [] };
  const perfis = perfisClaude();
  if (perfis.length === 0) return base;
  for (const perfil of perfis) {
    const credencial = lerJson(join(perfil, ".credentials.json")) ?? lerJson(join(perfil, "credentials.json"));
    const oauth = (credencial?.claudeAiOauth ?? credencial) as Record<string, unknown> | null;
    const token = typeof oauth?.accessToken === "string" ? oauth.accessToken.trim() : "";
    if (!token) continue;
    try {
      const r = await fetch("https://api.anthropic.com/api/oauth/usage", {
        headers: { authorization: `Bearer ${token}`, "anthropic-beta": "oauth-2025-04-20" },
        signal: AbortSignal.timeout(TEMPO_LIMITE),
      });
      if (r.status === 401 || r.status === 403) return { ...base, situacao: "sem_login", nota: "login_expirado" };
      if (!r.ok) return { ...base, situacao: "erro", nota: `http_${r.status}` };
      const json = (await r.json()) as Record<string, { utilization?: number; resets_at?: string } | null>;
      const rotulos: Record<string, string> = { five_hour: "sessao", seven_day: "semanal", seven_day_opus: "semanal_opus", seven_day_sonnet: "semanal_sonnet" };
      const janelas: JanelaUso[] = [];
      for (const [campo, id] of Object.entries(rotulos)) {
        const item = json[campo];
        const usado = porcentagem(item?.utilization);
        if (item && usado != null) janelas.push({ id, rotulo: id, usado, reiniciaEm: item.resets_at ?? undefined });
      }
      return { ...base, situacao: "ok", plano: typeof oauth?.subscriptionType === "string" ? oauth.subscriptionType : undefined, janelas };
    } catch (e) {
      return { ...base, situacao: "erro", nota: (e as Error).message };
    }
  }
  return { ...base, situacao: "sem_login" };
}

async function lerCodex(): Promise<UsoFerramenta> {
  const base: UsoFerramenta = { id: "codex", nome: "Codex", situacao: "ausente", janelas: [] };
  const raiz = join(homedir(), ".codex");
  if (!existsSync(raiz)) return base;
  const auth = lerJson(join(raiz, "auth.json"));
  const tokens = auth?.tokens as { access_token?: string; account_id?: string } | undefined;
  if (!tokens?.access_token || !tokens.account_id) return { ...base, situacao: "sem_login" };
  try {
    const r = await fetch("https://chatgpt.com/backend-api/wham/usage", {
      headers: { authorization: `Bearer ${tokens.access_token}`, "chatgpt-account-id": tokens.account_id, accept: "application/json" },
      signal: AbortSignal.timeout(TEMPO_LIMITE),
    });
    if (r.status === 401 || r.status === 403) return { ...base, situacao: "sem_login", nota: "login_expirado" };
    if (!r.ok) return { ...base, situacao: "erro", nota: `http_${r.status}` };
    const json = (await r.json()) as { plan_type?: string; rate_limit?: Record<string, { used_percent?: number; reset_after_seconds?: number; reset_at?: number } | null> };
    const raizLimites = json.rate_limit ?? {};
    const janelas: JanelaUso[] = [];
    for (const [campo, id] of [["primary_window", "sessao"], ["secondary_window", "semanal"]] as const) {
      const item = raizLimites[campo];
      const usado = porcentagem(item?.used_percent);
      if (!item || usado == null) continue;
      const reinicia = item.reset_at ? new Date(item.reset_at * 1000) : item.reset_after_seconds ? new Date(Date.now() + item.reset_after_seconds * 1000) : undefined;
      janelas.push({ id, rotulo: id, usado, reiniciaEm: reinicia?.toISOString() });
    }
    return { ...base, situacao: "ok", plano: json.plan_type, janelas };
  } catch (e) {
    return { ...base, situacao: "erro", nota: (e as Error).message };
  }
}

function arquivoMaisRecente(pasta: string, profundidade = 2): { caminho: string; modificado: number } | null {
  let melhor: { caminho: string; modificado: number } | null = null;
  const visitar = (dir: string, nivel: number) => {
    let itens: string[] = [];
    try {
      itens = readdirSync(dir);
    } catch {
      return;
    }
    for (const nome of itens) {
      const caminho = join(dir, nome);
      let info;
      try {
        info = statSync(caminho);
      } catch {
        continue;
      }
      if (info.isDirectory() && nivel < profundidade) visitar(caminho, nivel + 1);
      else if (nome.endsWith(".jsonl") && (!melhor || info.mtimeMs > melhor.modificado)) melhor = { caminho, modificado: info.mtimeMs };
    }
  };
  visitar(pasta, 0);
  return melhor;
}

function lerFinal(caminho: string, limite = 8 * 1024 * 1024): string {
  const tamanho = statSync(caminho).size;
  const inicio = Math.max(0, tamanho - limite);
  const buffer = Buffer.alloc(tamanho - inicio);
  const fd = openSync(caminho, "r");
  try {
    readSync(fd, buffer, 0, buffer.length, inicio);
  } finally {
    closeSync(fd);
  }
  return buffer.toString("utf8");
}

function lerSessaoAtual(): SessaoAtual | null {
  const recente = arquivoMaisRecente(join(homedir(), ".claude", "projects"));
  if (!recente) return null;
  const sessao: SessaoAtual = {
    projeto: basename(join(recente.caminho, "..")).replace(/^[A-Za-z]--/, "").replace(/-/g, "\\"),
    arquivo: basename(recente.caminho),
    ultimaAtividade: new Date(recente.modificado).toISOString(),
    mensagens: 0,
    entrada: 0,
    saida: 0,
    cacheCriado: 0,
    cacheLido: 0,
  };
  const vistos = new Set<string>();
  for (const linha of lerFinal(recente.caminho).split("\n")) {
    if (!linha.includes('"usage"')) {
      if (!sessao.inicio && linha.includes('"timestamp"')) {
        const m = /"timestamp":"([^"]+)"/.exec(linha);
        if (m) sessao.inicio = m[1];
      }
      continue;
    }
    let json: { timestamp?: string; message?: { id?: string; model?: string; usage?: Record<string, number> } };
    try {
      json = JSON.parse(linha);
    } catch {
      continue;
    }
    const uso = json.message?.usage;
    if (!uso) continue;
    const id = json.message?.id;
    if (id && vistos.has(id)) continue;
    if (id) vistos.add(id);
    sessao.inicio ??= json.timestamp;
    sessao.mensagens++;
    sessao.modelo = json.message?.model ?? sessao.modelo;
    sessao.entrada += uso.input_tokens ?? 0;
    sessao.saida += uso.output_tokens ?? 0;
    sessao.cacheCriado += uso.cache_creation_input_tokens ?? 0;
    sessao.cacheLido += uso.cache_read_input_tokens ?? 0;
  }
  return sessao;
}

export async function lerConsumo(forcar = false): Promise<Consumo> {
  if (!forcar && cache && Date.now() - cache.em < 60000) return cache.valor;
  const [claude, codex] = await Promise.all([lerClaude(), lerCodex()]);
  let sessao: SessaoAtual | null = null;
  try {
    sessao = lerSessaoAtual();
  } catch {
    sessao = null;
  }
  const valor: Consumo = { atualizadoEm: new Date().toISOString(), ferramentas: [claude, codex], sessao };
  cache = { valor, em: Date.now() };
  return valor;
}
