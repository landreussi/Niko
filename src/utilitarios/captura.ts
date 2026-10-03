import { executarComando, type ResultadoComando } from "./comandos";
import { useRotina, DIA_VAZIO } from "../estado/rotina";
import { hojeISO } from "./datas";
import { T } from "../textos/textos";
import { normalizarTexto, urlSegura } from "./basicos";
import { escaparHtml } from "./sanitizar";

export type TipoCaptura = "tarefa" | "gasto" | "link" | "nota" | "lembrete";

export const TIPOS_CAPTURA: TipoCaptura[] = ["tarefa", "gasto", "link", "nota", "lembrete"];

export function capturar(tipo: TipoCaptura, texto: string): ResultadoComando {
  const limpo = texto.trim();
  if (!limpo) return { agente: "organizador", resposta: T.validacao.obrigatorio, ok: false };
  if (tipo === "nota") {
    const hoje = hojeISO();
    const rotina = useRotina.getState();
    const atual = rotina.dias[hoje] ?? DIA_VAZIO;
    rotina.atualizarDia(hoje, { diario: `${atual.diario}<p>${escaparHtml(limpo.slice(0, 1000))}</p>` });
    return { agente: "organizador", resposta: T.ilha.notaSalva, ok: true };
  }
  return executarComando(`/${tipo} ${limpo}`);
}

export function capturarLivre(texto: string): ResultadoComando {
  const limpo = texto.trim();
  if (limpo.startsWith("/")) return executarComando(limpo);
  const [primeira, ...resto] = limpo.split(/\s+/);
  const chave = normalizarTexto(primeira ?? "").replace(/:$/, "");
  const mapa: Record<string, TipoCaptura> = { tarefa: "tarefa", gasto: "gasto", link: "link", nota: "nota", lembrete: "lembrete" };
  if (mapa[chave]) return capturar(mapa[chave], resto.join(" "));
  if (chave === "receita") return executarComando(`/receita ${resto.join(" ")}`);
  if (urlSegura(primeira ?? "")) return capturar("link", limpo);
  return capturar("tarefa", limpo);
}
