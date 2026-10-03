import { useRotina, tarefasDoDia, habitoCumprido } from "../estado/rotina";
import { useEstudos, revisoesParaHoje } from "../estado/estudos";
import { useFinancas, gastosDoMes, parteDoUsuario } from "../estado/financas";
import { useComunicacao } from "../estado/comunicacao";
import { useConfig } from "../estado/configuracoes";
import { usePomodoro } from "../estado/pomodoro";
import { AGENTES, useAgentes } from "../estado/agentes";
import { hojeISO, formatar, diaDoMomento } from "./datas";
import { formatarDinheiro } from "./dinheiro";
import { somar } from "./basicos";
import { T } from "../textos/textos";
import type { AgenteId } from "../tipos";

export function resumoPorAgente(): Record<AgenteId, string> {
  const hoje = hojeISO();
  const rotina = useRotina.getState();
  const estudos = useEstudos.getState();
  const fin = useFinancas.getState();
  const tarefas = tarefasDoDia(rotina.tarefas, hoje).filter((t) => t.status !== "concluida" && t.status !== "cancelada");
  const habitos = rotina.habitos.filter((h) => !h.arquivado && !habitoCumprido(h, rotina.registros[hoje]?.[h.id]));
  const revisoes = revisoesParaHoje(estudos);
  const prova = estudos.datas.filter((d) => !d.concluida && d.data >= hoje).sort((a, b) => a.data.localeCompare(b.data))[0];
  const gasto = somar(gastosDoMes(fin, hoje.slice(0, 7)), (t) => parteDoUsuario(t, fin.divisoes));
  const alertas = useAgentes.getState().alertas;
  const falha = alertas.find((a) => a.agenteId === "operador");
  const falhaConexao = alertas.find((a) => a.agenteId === "java" && a.servico);
  const areasCodigo = estudos.areas.filter((a) => a.tipo === "programacao").map((a) => a.id);
  const materiaCodigo = estudos.materias.find((m) => areasCodigo.includes(m.areaId));
  const github = useComunicacao.getState().conexoes.find((c) => c.id === "github" && c.ligada && c.resumo);
  return {
    organizador: tarefas.length || habitos.length ? `${T.falas.organizador.bomDia(tarefas.length)} ${habitos.length ? T.falas.organizador.habitos(habitos.length) : ""}`.trim() : T.falas.organizador.livre,
    tutor: revisoes ? T.falas.tutor.revisoes(revisoes) : prova ? T.falas.tutor.prova(prova.titulo, formatar(prova.data, "d 'de' MMM")) : T.falas.tutor.livre,
    operador: falha ? falha.texto : gasto ? T.falas.operador.gasto(formatarDinheiro(gasto)) : T.falas.operador.livre,
    java: falhaConexao ? falhaConexao.texto : github ? github.resumo : materiaCodigo ? T.falas.java.estudo(materiaCodigo.nome) : T.falas.java.livre,
  };
}

export function contextoParaIa(): string {
  const cfg = useConfig.getState();
  const hoje = hojeISO();
  const rotina = useRotina.getState();
  const estudos = useEstudos.getState();
  const fin = useFinancas.getState();
  const tarefas = tarefasDoDia(rotina.tarefas, hoje).map((t) => `- [${T.status[t.status]}] ${t.titulo}${t.hora ? ` ${t.hora}` : ""}`).slice(0, 20);
  const provas = estudos.datas.filter((d) => !d.concluida && d.data >= hoje).slice(0, 5).map((d) => `- ${d.titulo} em ${d.data}`);
  const memoria = useComunicacao.getState().memoria.slice(-20).map((m) => `- ${m.texto}`);
  const pomodoros = usePomodoro.getState().sessoes.filter((s) => diaDoMomento(s.inicio) === hoje && s.etapa === "foco").length;
  const linhas = [
    `Hoje é ${formatar(hoje, "EEEE, d 'de' MMMM 'de' yyyy")}. Usuário: ${cfg.nome || "sem nome"}.`,
    `Tarefas de hoje:\n${tarefas.join("\n") || "- nenhuma"}`,
    `Revisões pendentes hoje: ${revisoesParaHoje(estudos)}. Pomodoros hoje: ${pomodoros}.`,
    `Próximas datas de estudo:\n${provas.join("\n") || "- nenhuma"}`,
    `Fatos que o usuário pediu para lembrar:\n${memoria.join("\n") || "- nenhum"}`,
  ];
  if (!cfg.nuncaFinanceiro) {
    const gasto = somar(gastosDoMes(fin, hoje.slice(0, 7)), (t) => parteDoUsuario(t, fin.divisoes));
    linhas.push(`Gasto do mês até agora: ${formatarDinheiro(gasto)}.`);
  }
  return linhas.join("\n\n");
}

export function promptDoAgente(agente: AgenteId): string {
  const { nomes, cargos } = useConfig.getState().agentes;
  const colegas = AGENTES.filter((a) => a !== agente).map((a) => `- ${nomes[a]}, ${cargos[a]}: ${T.agentes.areas[a]}`).join("\n");
  return [
    `Você é ${nomes[agente]}, ${cargos[agente]} no Niko, um app pessoal do usuário para rotina, estudos, finanças e projetos. Sua área: ${T.agentes.areas[agente]}.`,
    `Colegas do time:\n${colegas}`,
    "Regras:",
    "- Responda sempre em português do Brasil, curto e direto. Nunca use travessão nem emoji.",
    "- Você responde sozinho. Ajude no que foi pedido; se o assunto for bem de outro colega, ajude mesmo assim e diga em uma frase quem cuida disso.",
    "- Você tem acesso de leitura a todo o banco do usuário. Antes de falar de tarefas, agenda, dinheiro, estudos, hábitos, metas, diário, anotações, histórico ou conexões, consulte com ler_* ou consultar_banco (pode chamar várias vezes, com busca e período). Nunca invente dados nem diga que não tem acesso sem tentar.",
    "- Para perguntas sobre o computador (memória, processador, disco, bateria, Wi-Fi, Bluetooth, programas e janelas abertas), use ler_computador.",
    "- Para criar, concluir, lançar, marcar ou guardar algo, chame a ferramenta certa. Ela mostra um cartão e o usuário confirma. Diga que deixou pronto para confirmar, nunca que já salvou.",
    "- Pode chamar várias ferramentas na mesma resposta quando o pedido tiver várias coisas.",
    `- Hoje é ${hojeISO()}. Converta datas como amanhã ou sexta para AAAA-MM-DD e horas para HH:MM.`,
    "- Se as ferramentas não estiverem disponíveis, sugira o comando exato (/tarefa, /gasto, /lembrete, /compra) para o usuário clicar.",
    ...(agente === "java" ? ["- Em programação, explique com exemplos curtos em blocos de código com a linguagem indicada."] : []),
    "",
    "Contexto atual:",
    contextoParaIa(),
  ].join("\n");
}
