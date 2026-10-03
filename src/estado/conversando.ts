import { create } from "zustand";
import type { AgenteId, CartaoConfirmacao, Mensagem } from "../tipos";
import { useComunicacao } from "./comunicacao";
import { useAgentes } from "./agentes";
import { useConfig } from "./configuracoes";
import { executarComando, confirmarComando } from "../utilitarios/comandos";
import { detectarIntencao } from "../utilitarios/intencoes";
import { resumoPorAgente } from "../utilitarios/contextoIa";
import { acharMencao, escolherAgente, historicoParaIa, perguntarAssistente, provedoresEmOrdem, mensagemDeErroIa } from "../utilitarios/assistente";
import { hojeISO } from "../utilitarios/datas";
import { guardarImagens, type AnexoPronto } from "../utilitarios/anexos";
import { tocarSom } from "../ponte/sons";
import { T } from "../textos/textos";

export type FaseConversa = "escolhendo" | "respondendo" | null;

interface EstadoConversando {
  conversaId: string | null;
  fase: FaseConversa;
  agente: AgenteId | null;
  parcial: string;
}

export const useConversando = create<EstadoConversando>()(() => ({ conversaId: null, fase: null, agente: null, parcial: "" }));

let controle: AbortController | null = null;
let quadroPendente = 0;
let parcialPendente = "";

function mostrarParcial(texto: string) {
  parcialPendente = texto;
  if (quadroPendente) return;
  quadroPendente = window.requestAnimationFrame(() => {
    quadroPendente = 0;
    useConversando.setState({ parcial: parcialPendente });
  });
}

function limpar() {
  if (quadroPendente) window.cancelAnimationFrame(quadroPendente);
  quadroPendente = 0;
  parcialPendente = "";
  controle = null;
  useConversando.setState({ conversaId: null, fase: null, agente: null, parcial: "" });
}

export function ocupado(): boolean {
  return useConversando.getState().fase !== null;
}

export function pararResposta() {
  controle?.abort();
}

const esperar = (ms: number) => new Promise((r) => window.setTimeout(r, ms));

async function responder(conversaId: string, agente: AgenteId, texto: string, extra: Partial<Mensagem> = {}, atraso = 280) {
  useConversando.setState({ conversaId, fase: "respondendo", agente, parcial: "" });
  await esperar(atraso);
  useComunicacao.getState().adicionarMensagem(conversaId, { autor: "agente", agenteId: agente, texto, ...extra });
  limpar();
}

function limiteAtingido(): boolean {
  const cfg = useConfig.getState().consumo;
  if (cfg.limiteMensal <= 0 || cfg.precoEntrada + cfg.precoSaida <= 0) return false;
  const mes = hojeISO().slice(0, 7);
  const custo = useComunicacao.getState().usoIa.filter((u) => u.data.startsWith(mes)).reduce((a, u) => a + (u.entrada * cfg.precoEntrada + u.saida * cfg.precoSaida) / 1e6, 0);
  return custo >= cfg.limiteMensal;
}

async function perguntar(conversaId: string, pedido: string, agente: AgenteId, rapido: boolean, historico?: Mensagem[]) {
  useConversando.setState({ conversaId, fase: "escolhendo", agente, parcial: "" });
  await esperar(rapido ? 320 : 1100);
  useConversando.setState({ fase: "respondendo" });
  void useAgentes.getState().trabalhar(agente, T.chat.pensando, 400);
  controle = new AbortController();
  const conversa = useComunicacao.getState().conversas.find((c) => c.id === conversaId);
  const anteriores = historico ?? (conversa?.mensagens ?? []).slice(0, -1);
  const mensagemPedido = [...(conversa?.mensagens ?? [])].reverse().find((m) => m.autor === "usuario" && m.texto === pedido);
  const r = await perguntarAssistente({ agente, historico: historicoParaIa(anteriores, agente, mensagemPedido ?? pedido), sinal: controle.signal, aoTexto: mostrarParcial });
  const adicionar = useComunicacao.getState().adicionarMensagem;
  const origem = r.origem ? (r.trocas.length ? T.chat.trocouProvedor(r.trocas.join(", "), r.origem) : r.origem) : undefined;
  const automaticas = useConfig.getState().ia.autoAprovar ?? [];
  r.confirmacoes = r.confirmacoes.map((c) => {
    if (!automaticas.includes(c.tipo)) return c;
    if (c.tipo === "email" || c.tipo === "rascunho") return c;
    void Promise.resolve(confirmarComando(c));
    r.acoes.push(T.chat.permissao.acoes[c.tipo]);
    return { ...c, situacao: "confirmado" };
  });
  if (r.texto.trim() || r.confirmacoes.length) {
    adicionar(conversaId, {
      autor: "agente",
      agenteId: agente,
      texto: r.texto.trim(),
      confirmacoes: r.confirmacoes.length ? r.confirmacoes : undefined,
      acoes: r.acoes.length ? r.acoes : undefined,
      origem,
      incompleta: r.parado || (r.falha !== null && r.texto.trim().length > 0),
    });
    if (r.confirmacoes.length) void tocarSom("approval", "avisos");
  }
  if (r.parado && !r.texto.trim()) adicionar(conversaId, { autor: "agente", agenteId: agente, texto: T.chat.paradoAntes, repetir: pedido });
  if (r.falha !== null && !r.parado) {
    void tocarSom("error", "avisos");
    adicionar(conversaId, { autor: "agente", agenteId: agente, texto: mensagemDeErroIa(r.falha, r.trocas), detalhe: r.falha.slice(0, 600), erro: true, repetir: pedido });
  }
  limpar();
}

export async function enviarAoTime(conversaId: string, texto: string, anexos: AnexoPronto[] = []) {
  const limpo = texto.trim() || (anexos.length ? T.chat.anexos.semTexto : "");
  if (!limpo || ocupado()) return;
  const enviada = useComunicacao.getState().adicionarMensagem(conversaId, { autor: "usuario", agenteId: "organizador", texto: limpo, anexos: anexos.length ? anexos.map((a) => a.anexo) : undefined });
  guardarImagens(enviada.id, anexos.flatMap((a) => (a.imagemCompleta ? [a.imagemCompleta] : [])));
  void tocarSom("send");
  const mencao = acharMencao(limpo);
  const semMencao = mencao ? limpo.replace(/^@\S+\s*/, "") : limpo;
  const intencao = anexos.length ? ({ tipo: "desconhecida", agente: escolherAgente(semMencao) } as const) : detectarIntencao(semMencao);

  if (intencao.tipo === "comando") {
    const r = executarComando(intencao.comando, { confirmar: intencao.confirmar });
    await responder(conversaId, mencao ?? r.agente, r.resposta, { confirmacao: r.confirmacao });
    if (r.confirmacao) void tocarSom("approval", "avisos");
    return;
  }
  if (intencao.tipo === "saudacao" || intencao.tipo === "resumo") {
    const resumo = resumoPorAgente();
    const nomes = useConfig.getState().agentes.nomes;
    if (mencao) {
      await responder(conversaId, mencao, intencao.tipo === "saudacao" ? `${T.chat.oi(useConfig.getState().nome)} ${resumo[mencao]}` : resumo[mencao]);
      return;
    }
    const linhas = (Object.keys(resumo) as AgenteId[]).map((a) => `**${nomes[a]}:** ${resumo[a]}`).join("\n");
    await responder(conversaId, "organizador", `${intencao.tipo === "saudacao" ? `${T.chat.oi(useConfig.getState().nome)}\n\n` : ""}${linhas}`, {}, 420);
    return;
  }
  const temCodigo = anexos.some((a) => a.anexo.texto != null && /\.(js|jsx|ts|tsx|mjs|cjs|py|java|kt|cs|go|rs|rb|php|c|h|cpp|hpp|swift|sql|sh|ps1|vue|svelte|html?|css|scss|json)$/i.test(a.anexo.nome));
  const agente = mencao ?? (temCodigo ? "java" : escolherAgente(semMencao));
  const provedores = await provedoresEmOrdem();
  if (provedores.length === 0) {
    await responder(conversaId, agente, T.chat.semIaResposta);
    return;
  }
  if (limiteAtingido()) {
    void tocarSom("rate", "avisos");
    await responder(conversaId, "operador", T.chat.limiteAtingido);
    return;
  }
  await perguntar(conversaId, semMencao, agente, Boolean(mencao));
}

export async function tentarDeNovo(conversaId: string, mensagem: Mensagem) {
  if (ocupado() || !mensagem.repetir) return;
  const pedido = mensagem.repetir;
  const mensagens = useComunicacao.getState().conversas.find((c) => c.id === conversaId)?.mensagens ?? [];
  const ultimoPedido = mensagens.map((m) => m.autor === "usuario").lastIndexOf(true);
  const anteriores = mensagens.slice(0, Math.max(0, ultimoPedido)).filter((m) => !m.repetir);
  useComunicacao.getState().atualizarMensagem(conversaId, mensagem.id, { repetir: undefined });
  if (limiteAtingido()) {
    await responder(conversaId, "operador", T.chat.limiteAtingido, {}, 0);
    return;
  }
  await perguntar(conversaId, pedido, mensagem.agenteId, true, anteriores);
}

export async function usarSugestao(conversaId: string, comando: string) {
  if (ocupado()) return;
  const r = executarComando(comando, { confirmar: true });
  void tocarSom(r.confirmacao ? "approval" : "blip", r.confirmacao ? "avisos" : "interface");
  await responder(conversaId, r.agente, r.resposta, { confirmacao: r.confirmacao }, 120);
}

export async function decidirCartao(conversaId: string, mensagem: Mensagem, indice: number | null, aceitar: boolean) {
  const com = useComunicacao.getState();
  const cartao: CartaoConfirmacao | undefined = indice === null ? mensagem.confirmacao : mensagem.confirmacoes?.[indice];
  if (!cartao || cartao.situacao !== "pendente") return;
  const novo: CartaoConfirmacao = { ...cartao, situacao: aceitar ? "confirmado" : "cancelado" };
  const resposta = aceitar ? await confirmarComando(cartao) : T.chat.cancelado;
  if (indice === null) com.atualizarMensagem(conversaId, mensagem.id, { confirmacao: novo });
  else com.atualizarMensagem(conversaId, mensagem.id, { confirmacoes: mensagem.confirmacoes!.map((c, i) => (i === indice ? novo : c)) });
  const varios = (mensagem.confirmacoes?.length ?? 0) > 1;
  if (!varios) com.adicionarMensagem(conversaId, { autor: "agente", agenteId: mensagem.agenteId, texto: resposta });
  if (aceitar) void tocarSom("approve");
}
