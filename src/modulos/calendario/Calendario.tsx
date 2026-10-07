import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as EventoDePonteiro } from "react";
import { addDays, addMonths, addWeeks, eachDayOfInterval, endOfMonth, endOfWeek, isSameMonth, startOfMonth, startOfWeek } from "date-fns";
import { ChevronLeft, ChevronRight, Plus, Download, Upload, BellRing, CalendarDays, Trash2, Repeat, CornerDownLeft, Check, X, RefreshCw } from "lucide-react";
import { CabecalhoAba } from "../../componentes/CabecalhoAba";
import { AvisoFaixa, Cartao, Botao, Campo, Modal, Segmentado, Vazio } from "../../componentes/basicos";
import { abrirLink } from "../../desktop/desktop";
import { usarAgendaGoogle } from "./usarAgendaGoogle";
import { useComunicacao } from "../../estado/comunicacao";
import { Marca } from "../../marcas/Marca";
import { useOrganizacao } from "../../estado/organizacao";
import { useRotina } from "../../estado/rotina";
import { useEstudos } from "../../estado/estudos";
import { useFinancas } from "../../estado/financas";
import { useInterface } from "../../estado/interface";
import { T } from "../../textos/textos";
import { dataValida, deISO, formatar, formatarData, hojeISO, horaValida, paraISO } from "../../utilitarios/datas";
import { baixarArquivo, lerArquivoTexto } from "../../utilitarios/basicos";
import { EVENTO_NOVO } from "../../janelas/area-de-trabalho/usarAtalhos";
import type { Evento, Repeticao, Rota } from "../../tipos";
import { marcarItemFeito } from "../../utilitarios/marcarFeito";
import { editarEvento, excluirOcorrencia, itemFeito, itensDoCalendario, lerEventoRapido, podeMarcarFeito, repeteTodoDia, type DadosDoEvento, type EscopoDaEdicao, type FonteDoCalendario, type ItemDoCalendario } from "../../utilitarios/itensDoCalendario";
import { useConfig } from "../../estado/configuracoes";
import { funcaoLigada, type Funcao } from "../../utilitarios/funcoes";

type Fonte = FonteDoCalendario;
type Vista = "mes" | "semana" | "agenda";
type Item = ItemDoCalendario;
type Edicao = { evento: Evento; ocorrencia: string };
type PedidoDeEscopo = { texto: string; aoEscolher: (escopo: EscopoDaEdicao) => void };

const COR_FONTE: Record<Fonte, string> = {
  eventos: "#3b6fe0",
  tarefas: "#2f9e6b",
  habitos: "#14a3a3",
  estudos: "#a855f7",
  financas: "#d9922b",
  metas: "#e05a8a",
  google: "#4285f4",
};

const FONTES = Object.keys(T.calendario.fontes) as Fonte[];
const FUNCAO_DA_FONTE: Record<Fonte, Funcao> = { eventos: "calendario", tarefas: "journal", habitos: "journal", estudos: "estudos", financas: "financas", metas: "metas", google: "calendario" };
const ROTA_DA_FONTE: Record<Exclude<Fonte, "eventos" | "google">, Rota> = { tarefas: "journal", habitos: "journal", estudos: "estudos", financas: "financas", metas: "metas" };
const DISTANCIA_PARA_ARRASTAR = 6;

function escaparIcs(t: string) {
  return t.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function corDa(fonte: Fonte): CSSProperties {
  return { "--cor": COR_FONTE[fonte] } as CSSProperties;
}

function mudouAlgo(e: Evento, ocorrencia: string, novos: DadosDoEvento) {
  return e.titulo !== novos.titulo || ocorrencia !== novos.data || (e.hora ?? "") !== (novos.hora ?? "") || e.tipo !== novos.tipo || e.repeticao !== novos.repeticao;
}

function FormEvento({ aberto, dataInicial, edicao, aoSalvar, aoFechar }: { aberto: boolean; dataInicial: string; edicao: Edicao | null; aoSalvar: (dados: DadosDoEvento) => void; aoFechar: () => void }) {
  const [titulo, setTitulo] = useState("");
  const [data, setData] = useState(dataInicial);
  const [hora, setHora] = useState("");
  const [tipo, setTipo] = useState<"evento" | "lembrete">("evento");
  const [repeticao, setRepeticao] = useState<Repeticao>("nenhuma");
  const [erros, setErros] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!aberto) return;
    setTitulo(edicao?.evento.titulo ?? "");
    setData(edicao?.ocorrencia ?? dataInicial);
    setHora(edicao?.evento.hora ?? "");
    setTipo(edicao?.evento.tipo ?? "evento");
    setRepeticao(edicao?.evento.repeticao ?? "nenhuma");
    setErros({});
  }, [aberto, dataInicial, edicao]);

  return (
    <Modal aberto={aberto} titulo={edicao ? T.calendario.editarEvento : T.calendario.novoEvento} aoFechar={aoFechar}>
      <form
        className="formulario"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const novos: Record<string, string> = {};
          if (!titulo.trim()) novos.titulo = T.validacao.obrigatorio;
          if (!dataValida(data)) novos.data = T.validacao.dataInvalida;
          if (hora && !horaValida(hora)) novos.hora = T.validacao.horaInvalida;
          if (tipo === "lembrete" && !hora) novos.hora = T.calendario.lembreteHora;
          setErros(novos);
          if (Object.keys(novos).length) return;
          aoSalvar({ titulo: titulo.trim().slice(0, 120), data, hora: hora || undefined, tipo, repeticao });
          if (tipo === "lembrete" && typeof Notification !== "undefined" && Notification.permission === "default") void Notification.requestPermission();
        }}
      >
        <Segmentado rotulo={T.calendario.tipo} valor={tipo} aoMudar={setTipo} opcoes={[{ valor: "evento", rotulo: T.calendario.evento, icone: <CalendarDays size={13} /> }, { valor: "lembrete", rotulo: T.calendario.lembrete, icone: <BellRing size={13} /> }]} />
        <Campo id="ev-titulo" rotulo={T.estudos.tituloCartao} obrigatorio erro={erros.titulo}>
          <input id="ev-titulo" className="campo" value={titulo} maxLength={120} onChange={(e) => setTitulo(e.target.value)} />
        </Campo>
        <div className="formulario-linha">
          <Campo id="ev-data" rotulo={T.financas.data} obrigatorio erro={erros.data}>
            <input id="ev-data" type="date" className="campo" value={data} onChange={(e) => setData(e.target.value)} />
          </Campo>
          <Campo id="ev-hora" rotulo={T.calendario.hora} obrigatorio={tipo === "lembrete"} erro={erros.hora}>
            <input id="ev-hora" type="time" className="campo" value={hora} onChange={(e) => setHora(e.target.value)} />
          </Campo>
          <Campo id="ev-rep" rotulo={T.calendario.repeticao}>
            <select id="ev-rep" className="seletor" value={repeticao} onChange={(e) => setRepeticao(e.target.value as Repeticao)}>
              {(Object.keys(T.calendario.repeticoes) as Repeticao[]).map((r) => <option key={r} value={r}>{T.calendario.repeticoes[r]}</option>)}
            </select>
          </Campo>
        </div>
        {tipo === "lembrete" && <p className="campo-dica">{T.calendario.lembreteDica}</p>}
        <div className="formulario-acoes">
          <Botao onClick={aoFechar}>{T.geral.cancelar}</Botao>
          <Botao type="submit" variante="primario">{edicao ? T.geral.salvar : T.geral.criar}</Botao>
        </div>
      </form>
    </Modal>
  );
}

function EscolhaDeEscopo({ pedido, aoFechar }: { pedido: PedidoDeEscopo | null; aoFechar: () => void }) {
  const escolher = (escopo: EscopoDaEdicao) => {
    pedido?.aoEscolher(escopo);
    aoFechar();
  };
  return (
    <Modal aberto={Boolean(pedido)} titulo={T.calendario.escopoTitulo} aoFechar={aoFechar}>
      <p className="texto-2">{pedido?.texto}</p>
      <div className="formulario-acoes">
        <Botao onClick={aoFechar}>{T.geral.cancelar}</Botao>
        <Botao onClick={() => escolher("todos")}>{T.calendario.emTodos}</Botao>
        <Botao variante="primario" onClick={() => escolher("este")}>{T.calendario.soNesteDia}</Botao>
      </div>
    </Modal>
  );
}

function Chip({ i, feito, aoAbrir, aoIniciarArraste }: { i: Item; feito?: boolean; aoAbrir?: () => void; aoIniciarArraste?: (e: EventoDePonteiro<HTMLSpanElement>) => void }) {
  return (
    <span
      className="cal-chip"
      data-feito={feito ? "sim" : undefined}
      style={corDa(i.fonte)}
      title={i.hora ? `${i.hora} ${i.titulo}` : i.titulo}
      data-editavel={aoAbrir ? "sim" : undefined}
      onPointerDown={aoIniciarArraste}
      onClick={aoAbrir ? (e) => { e.stopPropagation(); aoAbrir(); } : undefined}
    >
      {i.hora && <span className="cal-chip-hora numero">{i.hora}</span>}
      <span className="cortar privado">{i.titulo}</span>
    </span>
  );
}

function LinhaDoDia({ i, aoAbrir, rotuloAbrir, aoExcluir, feito, aoMarcar }: { i: Item; aoAbrir?: () => void; rotuloAbrir?: string; aoExcluir?: () => void; feito?: boolean; aoMarcar?: () => void }) {
  const texto = (
    <>
      <span className="cortar privado">{i.titulo}</span>
      <span className="texto-3">{[T.calendario.fontes[i.fonte], i.evento && i.evento.repeticao !== "nenhuma" ? T.calendario.repeticoes[i.evento.repeticao] : ""].filter(Boolean).join(" . ")}</span>
    </>
  );
  return (
    <div className="cal-linha" style={corDa(i.fonte)} data-feito={feito ? "sim" : undefined}>
      <span className="cal-linha-hora numero">{i.hora ?? ""}</span>
      <span className="cal-linha-barra" />
      {aoAbrir ? (
        <button type="button" className="cal-linha-texto cal-linha-abrir" title={rotuloAbrir} aria-label={rotuloAbrir ? `${rotuloAbrir}: ${i.titulo}` : undefined} onClick={aoAbrir}>{texto}</button>
      ) : (
        <div className="cal-linha-texto">{texto}</div>
      )}
      {aoMarcar && (
        <button type="button" className="cal-linha-check" aria-pressed={Boolean(feito)} aria-label={feito ? T.calendario.desmarcarFeito(i.titulo) : T.calendario.marcarFeito(i.titulo)} title={feito ? T.calendario.desmarcarFeito(i.titulo) : T.calendario.marcarFeito(i.titulo)} onClick={aoMarcar}>
          {feito && <Check size={13} />}
        </button>
      )}
      {aoExcluir && <Botao pequeno soIcone variante="fantasma" icone={<Trash2 size={13} />} aria-label={T.geral.excluir} onClick={aoExcluir} />}
    </div>
  );
}

type Arraste = { item: Item; inicioX: number; inicioY: number; x: number; y: number; ativo: boolean; alvo: string | null };

export default function Calendario() {
  const parametros = useInterface((s) => s.parametros);
  const avisar = useInterface((s) => s.avisar);
  const irPara = useInterface((s) => s.irPara);
  const eventos = useOrganizacao((s) => s.eventos);
  const metas = useOrganizacao((s) => s.metas);
  const criarEvento = useOrganizacao((s) => s.criarEvento);
  const atualizarEvento = useOrganizacao((s) => s.atualizarEvento);
  const excluirEvento = useOrganizacao((s) => s.excluirEvento);
  const restaurarEvento = useOrganizacao((s) => s.restaurarEvento);
  const tarefas = useRotina((s) => s.tarefas);
  const habitos = useRotina((s) => s.habitos);
  const registros = useRotina((s) => s.registros);
  const datas = useEstudos((s) => s.datas);
  const revisoes = useEstudos((s) => s.revisoesConteudo);
  const recorrentes = useFinancas((s) => s.recorrentes);
  const [vista, setVista] = useState<Vista>("mes");
  const [foco, setFoco] = useState(parametros.data && dataValida(parametros.data) ? parametros.data : hojeISO());
  const [fontes, setFontes] = useState<Record<Fonte, boolean>>({ eventos: true, tarefas: true, habitos: true, estudos: true, financas: true, metas: true, google: true });
  const [novo, setNovo] = useState(false);
  const [edicao, setEdicao] = useState<Edicao | null>(null);
  const [escopo, setEscopo] = useState<PedidoDeEscopo | null>(null);
  const [diaSelecionado, setDiaSelecionado] = useState(foco);
  const [rapido, setRapido] = useState("");
  const [arraste, setArraste] = useState<Arraste | null>(null);
  const acabouDeArrastar = useRef(false);
  const arrasteAtual = useRef<Arraste | null>(null);

  useEffect(() => {
    if (parametros.data && dataValida(parametros.data)) {
      setFoco(parametros.data);
      setDiaSelecionado(parametros.data);
    }
  }, [parametros.data]);

  useEffect(() => {
    const aoNovo = (e: Event) => {
      if ((e as CustomEvent).detail === "calendario") setNovo(true);
    };
    window.addEventListener(EVENTO_NOVO, aoNovo);
    return () => window.removeEventListener(EVENTO_NOVO, aoNovo);
  }, []);

  const base = deISO(foco);
  const hoje = hojeISO();
  const intervalo = vista === "mes"
    ? { inicio: startOfWeek(startOfMonth(base), { weekStartsOn: 1 }), fim: endOfWeek(endOfMonth(base), { weekStartsOn: 1 }) }
    : vista === "semana"
      ? { inicio: startOfWeek(base, { weekStartsOn: 1 }), fim: endOfWeek(base, { weekStartsOn: 1 }) }
      : { inicio: base, fim: addDays(base, 30) };
  const inicioISO = paraISO(intervalo.inicio);
  const fimISO = paraISO(intervalo.fim);

  const desligadas = useConfig((s) => s.funcoesDesligadas);
  const fimProximos = paraISO(addDays(deISO(hoje), 6));
  const sugestaoGoogle = useConfig((s) => s.sugestaoAgendaGoogle);
  const definirConfig = useConfig((s) => s.definir);
  const agendaConectada = useComunicacao((s) => Boolean(s.conexoes.find((c) => c.id === "agenda")?.chaveSalva));
  const sugerirGoogle = sugestaoGoogle && !agendaConectada && funcaoLigada("calendario", desligadas);
  const agendaGoogle = usarAgendaGoogle(funcaoLigada("calendario", desligadas) ? [[inicioISO, fimISO], [hoje, fimProximos]] : []);
  const gerar = useMemo(() => (de: string, ate: string) => {
    const locais = itensDoCalendario({ eventos, tarefas, habitos, datas, revisoes, metas, recorrentes }, de, ate);
    const google: Item[] = agendaGoogle.eventos.filter((e) => e.data >= de && e.data <= ate).map((e) => ({ id: `google-${e.id}`, titulo: e.titulo, data: e.data, hora: e.hora, fonte: "google", link: e.link }));
    return [...locais, ...google].filter((i) => fontes[i.fonte]).sort((a, b) => `${a.data}${a.hora ?? "99"}`.localeCompare(`${b.data}${b.hora ?? "99"}`));
  }, [eventos, tarefas, habitos, datas, revisoes, metas, recorrentes, fontes, desligadas, agendaGoogle.eventos]);
  const itens = useMemo(() => gerar(inicioISO, fimISO), [gerar, inicioISO, fimISO]);
  const proximosTodos = useMemo(() => gerar(hoje, fimProximos), [gerar, hoje, fimProximos]);
  const proximos = proximosTodos.filter((i) => !repeteTodoDia(i));
  const diariosProximos = [...new Map(proximosTodos.filter(repeteTodoDia).map((i) => [i.evento?.id ?? i.habito?.id, i])).values()];
  const doDiaSelecionado = useMemo(() => gerar(diaSelecionado, diaSelecionado), [gerar, diaSelecionado]);

  const esconderDiarios = vista !== "semana";
  const porDia: Record<string, Item[]> = {};
  const diariosPorDia: Record<string, number> = {};
  for (const i of itens) {
    if (esconderDiarios && repeteTodoDia(i)) diariosPorDia[i.data] = (diariosPorDia[i.data] ?? 0) + 1;
    else (porDia[i.data] ??= []).push(i);
  }
  const diariosDoDia = doDiaSelecionado.filter(repeteTodoDia);
  const doDia = doDiaSelecionado.filter((i) => !repeteTodoDia(i));
  const diaTodo = doDia.filter((i) => !i.hora);
  const comHora = doDia.filter((i) => i.hora);

  const mover = (n: number) => {
    const d = vista === "mes" ? addMonths(base, n) : vista === "semana" ? addWeeks(base, n) : addDays(base, n * 30);
    setFoco(paraISO(d));
  };

  const irParaHoje = () => {
    setFoco(hoje);
    setDiaSelecionado(hoje);
  };

  const exportarIcs = () => {
    const agora = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    const regra: Record<Repeticao, string> = { nenhuma: "", diaria: "RRULE:FREQ=DAILY", semanal: "RRULE:FREQ=WEEKLY", mensal: "RRULE:FREQ=MONTHLY" };
    const corpo = eventos.map((e) => {
      const data = e.data.replace(/-/g, "");
      const inicio = e.hora ? `DTSTART:${data}T${e.hora.replace(":", "")}00` : `DTSTART;VALUE=DATE:${data}`;
      const excecoes = e.repeticao !== "nenhuma" ? (e.excecoes ?? []).map((x) => (e.hora ? `EXDATE:${x.replace(/-/g, "")}T${e.hora.replace(":", "")}00` : `EXDATE;VALUE=DATE:${x.replace(/-/g, "")}`)) : [];
      return ["BEGIN:VEVENT", `UID:${e.id}@niko`, `DTSTAMP:${agora}`, inicio, `SUMMARY:${escaparIcs(e.titulo)}`, regra[e.repeticao], ...excecoes, "END:VEVENT"].filter(Boolean).join("\r\n");
    });
    baixarArquivo("niko-calendario.ics", ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Niko//PT-BR", ...corpo, "END:VCALENDAR"].join("\r\n"), "text/calendar");
  };

  const importarIcs = async (arquivo: File) => {
    try {
      const texto = await lerArquivoTexto(arquivo, 2 * 1024 * 1024);
      const blocos = texto.replace(/\r\n[ \t]/g, "").split("BEGIN:VEVENT").slice(1, 500);
      let n = 0;
      for (const b of blocos) {
        const resumo = /SUMMARY[^:]*:(.*)/.exec(b)?.[1]?.trim().replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\n/g, " ");
        const inicio = /DTSTART[^:]*:(\d{8})(T(\d{4}))?/.exec(b);
        if (!resumo || !inicio) continue;
        const data = `${inicio[1].slice(0, 4)}-${inicio[1].slice(4, 6)}-${inicio[1].slice(6, 8)}`;
        if (!dataValida(data)) continue;
        const rr = /RRULE:FREQ=(DAILY|WEEKLY|MONTHLY)/.exec(b)?.[1];
        const excecoes = [...b.matchAll(/EXDATE[^:]*:([\d,TZ]+)/g)].flatMap((m) => m[1].split(",")).map((x) => `${x.slice(0, 4)}-${x.slice(4, 6)}-${x.slice(6, 8)}`).filter(dataValida);
        const criado = criarEvento({ titulo: resumo.slice(0, 120), data, hora: inicio[3] ? `${inicio[3].slice(0, 2)}:${inicio[3].slice(2)}` : undefined, tipo: "evento", repeticao: rr === "DAILY" ? "diaria" : rr === "WEEKLY" ? "semanal" : rr === "MONTHLY" ? "mensal" : "nenhuma" });
        if (rr && excecoes.length) atualizarEvento(criado.id, { excecoes: excecoes.slice(0, 400) });
        n++;
      }
      avisar(n ? T.calendario.importadosIcs(n) : T.validacao.arquivoInvalido);
    } catch {
      avisar(T.validacao.arquivoInvalido);
    }
  };

  const criarRapido = () => {
    const { titulo, hora, repeticao } = lerEventoRapido(rapido);
    if (!titulo) return;
    criarEvento({ titulo: titulo.slice(0, 120), data: diaSelecionado, hora, tipo: "evento", repeticao });
    setRapido("");
    avisar(T.calendario.criado(titulo));
  };

  const aplicarEdicao = (alvo: Edicao, novos: DadosDoEvento, escolha: EscopoDaEdicao, aviso: string) => {
    const atual = useOrganizacao.getState().eventos.find((e) => e.id === alvo.evento.id);
    if (!atual) return;
    const r = editarEvento(atual, alvo.ocorrencia, novos, escolha);
    atualizarEvento(atual.id, r.atualizar);
    if (r.criar) criarEvento(r.criar);
    avisar(aviso);
  };

  const pedirOuAplicar = (alvo: Edicao, novos: DadosDoEvento, texto: string, aviso: string) => {
    if (alvo.evento.repeticao === "nenhuma") aplicarEdicao(alvo, novos, "todos", aviso);
    else setEscopo({ texto, aoEscolher: (escolha) => aplicarEdicao(alvo, novos, escolha, aviso) });
  };

  const salvarForm = (novos: DadosDoEvento) => {
    const alvo = edicao;
    fecharForm();
    if (!alvo) {
      criarEvento(novos);
      return;
    }
    if (!mudouAlgo(alvo.evento, alvo.ocorrencia, novos)) return;
    pedirOuAplicar(alvo, novos, T.calendario.escopoEditar(alvo.evento.titulo), T.calendario.atualizado(novos.titulo));
  };

  const fecharForm = () => {
    setNovo(false);
    setEdicao(null);
  };

  const abrirEdicao = (i: Item) => {
    if (!i.evento) return;
    setDiaSelecionado(i.data);
    setEdicao({ evento: i.evento, ocorrencia: i.data });
  };

  const moverPara = (i: Item, destino: string) => {
    if (!i.evento || destino === i.data) return;
    const e = i.evento;
    pedirOuAplicar({ evento: e, ocorrencia: i.data }, { titulo: e.titulo, data: destino, hora: e.hora, tipo: e.tipo, repeticao: e.repeticao }, T.calendario.escopoMover(e.titulo), T.calendario.movido(e.titulo));
    setDiaSelecionado(destino);
  };

  const excluir = (i: Item) => {
    if (!i.evento) return undefined;
    const e = i.evento;
    const executar = (escolha: EscopoDaEdicao) => {
      const atual = useOrganizacao.getState().eventos.find((x) => x.id === e.id);
      if (!atual) return;
      const r = excluirOcorrencia(atual, i.data, escolha);
      if (r === "excluir") {
        const removido = excluirEvento(atual.id);
        if (removido) avisar(T.geral.excluido, () => restaurarEvento(removido));
        return;
      }
      const anteriores = atual.excecoes;
      atualizarEvento(atual.id, r);
      avisar(T.geral.excluido, () => atualizarEvento(atual.id, { excecoes: anteriores }));
    };
    return () => {
      if (e.repeticao === "nenhuma") executar("todos");
      else setEscopo({ texto: T.calendario.escopoExcluir(e.titulo), aoEscolher: executar });
    };
  };

  const abrirNoModulo = (i: Item) => {
    if (i.fonte === "google") return i.link ? { rotulo: T.calendario.abrirNoGoogle, abrir: () => abrirLink(i.link!) } : undefined;
    if (i.fonte === "eventos") return undefined;
    const rota = ROTA_DA_FONTE[i.fonte];
    return { rotulo: T.calendario.abrirEm(T.rotas[rota]), abrir: () => irPara(rota, rota === "journal" ? { data: i.data } : undefined) };
  };

  const propsDaLinha = (i: Item) => {
    const modulo = i.evento ? { abrir: () => abrirEdicao(i), rotulo: T.geral.editar } : abrirNoModulo(i);
    const props: Parameters<typeof LinhaDoDia>[0] = { i, aoAbrir: modulo?.abrir, rotuloAbrir: modulo?.rotulo, aoExcluir: i.evento ? excluir(i) : undefined };
    if (podeMarcarFeito(i)) {
      const feito = itemFeito(i, registros);
      props.feito = feito;
      props.aoMarcar = i.habito && i.data > hoje ? undefined : () => marcarItemFeito(i, !feito);
    }
    return props;
  };

  const iniciarArraste = (i: Item) => (e: EventoDePonteiro<HTMLSpanElement>) => {
    if (!i.evento || e.button !== 0) return;
    setArraste({ item: i, inicioX: e.clientX, inicioY: e.clientY, x: e.clientX, y: e.clientY, ativo: false, alvo: null });
  };

  arrasteAtual.current = arraste;
  const moverParaAtual = useRef(moverPara);
  moverParaAtual.current = moverPara;

  useEffect(() => {
    if (!arraste) return;
    const aoMover = (e: PointerEvent) => {
      const a = arrasteAtual.current;
      if (!a) return;
      const ativo = a.ativo || Math.hypot(e.clientX - a.inicioX, e.clientY - a.inicioY) > DISTANCIA_PARA_ARRASTAR;
      if (!ativo) return;
      const sob = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-dia]") as HTMLElement | null;
      setArraste({ ...a, x: e.clientX, y: e.clientY, ativo, alvo: sob?.dataset.dia ?? null });
    };
    const aoSoltar = () => {
      const a = arrasteAtual.current;
      if (a?.ativo) {
        acabouDeArrastar.current = true;
        window.setTimeout(() => (acabouDeArrastar.current = false), 0);
        if (a.alvo) moverParaAtual.current(a.item, a.alvo);
      }
      setArraste(null);
    };
    const aoCancelar = () => setArraste(null);
    window.addEventListener("pointermove", aoMover);
    window.addEventListener("pointerup", aoSoltar);
    window.addEventListener("pointercancel", aoCancelar);
    window.addEventListener("blur", aoCancelar);
    return () => {
      window.removeEventListener("pointermove", aoMover);
      window.removeEventListener("pointerup", aoSoltar);
      window.removeEventListener("pointercancel", aoCancelar);
      window.removeEventListener("blur", aoCancelar);
    };
  }, [Boolean(arraste)]);

  const abrirChip = (i: Item) => (i.evento ? () => { if (!acabouDeArrastar.current) abrirEdicao(i); } : undefined);

  const escolherDia = (iso: string) => {
    if (acabouDeArrastar.current) return;
    setDiaSelecionado(iso);
    if (vista === "mes" && !isSameMonth(deISO(iso), base)) setFoco(iso);
  };

  const tituloPeriodo = vista === "mes"
    ? { principal: formatarData(base, "MMMM"), secundario: formatarData(base, "yyyy") }
    : { principal: `${formatar(inicioISO, "d MMM")} . ${formatar(fimISO, "d MMM")}`, secundario: formatarData(intervalo.fim, "yyyy") };

  const dias = eachDayOfInterval({ start: intervalo.inicio, end: intervalo.fim });
  const semanasNoMes = Math.ceil(dias.length / 7);

  const agrupadoAgenda = Object.entries(porDia);
  const diariosNoPeriodo = [...new Map(itens.filter(repeteTodoDia).map((i) => [i.evento?.id ?? i.habito?.id, i])).values()];
  const alvoDoArraste = arraste?.ativo ? arraste.alvo : null;

  return (
    <>
      <CabecalhoAba
        titulo={T.calendario.titulo}
        subtitulo={T.calendario.subtitulo}
        agente="organizador"
        acoes={
          <>
            <Botao pequeno variante="primario" icone={<Plus size={13} />} onClick={() => setNovo(true)}>{T.calendario.novoEvento}</Botao>
            <Botao pequeno icone={<Download size={13} />} onClick={exportarIcs} disabled={eventos.length === 0}>{T.calendario.exportarIcs}</Botao>
            <label className="botao botao-secundario botao-pequeno" style={{ cursor: "pointer" }}>
              <Upload size={13} />
              {T.calendario.importarIcs}
              <input type="file" accept=".ics,text/calendar" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void importarIcs(f); e.target.value = ""; }} />
            </label>
          </>
        }
      />

      <div className="cal-barra">
        <div className="cal-periodo">
          <h2><span>{tituloPeriodo.principal}</span> <span className="texto-3">{tituloPeriodo.secundario}</span></h2>
          <div className="cal-navegar">
            <Botao pequeno soIcone variante="fantasma" icone={<ChevronLeft size={15} />} aria-label={T.geral.anterior} onClick={() => mover(-1)} />
            <Botao pequeno variante="fantasma" onClick={irParaHoje}>{T.geral.hoje}</Botao>
            <Botao pequeno soIcone variante="fantasma" icone={<ChevronRight size={15} />} aria-label={T.geral.proximo} onClick={() => mover(1)} />
          </div>
        </div>
        <Segmentado<Vista> rotulo={T.calendario.titulo} valor={vista} aoMudar={setVista} opcoes={(Object.keys(T.calendario.vistas) as Vista[]).map((v) => ({ valor: v, rotulo: T.calendario.vistas[v] }))} />
        <div className="cal-filtros" role="group" aria-label={T.calendario.mostrar}>
          {FONTES.filter((f) => funcaoLigada(FUNCAO_DA_FONTE[f], desligadas)).filter((f) => f !== "habitos" || habitos.some((h) => !h.arquivado && h.hora)).filter((f) => f !== "google" || agendaGoogle.situacao !== "desligada").map((f) => (
            <button key={f} type="button" className="cal-filtro" style={corDa(f)} aria-pressed={fontes[f]} onClick={() => setFontes({ ...fontes, [f]: !fontes[f] })}>
              <span className="cal-filtro-ponto" />
              {T.calendario.fontes[f]}
            </button>
          ))}
          {agendaGoogle.situacao !== "desligada" && (
            <Botao
              pequeno
              soIcone
              variante="fantasma"
              icone={<RefreshCw size={14} className={agendaGoogle.situacao === "carregando" ? "atualizacao-girando" : undefined} />}
              aria-label={T.calendario.atualizarGoogle}
              title={T.calendario.atualizarGoogle}
              disabled={agendaGoogle.situacao === "carregando"}
              onClick={agendaGoogle.atualizar}
            />
          )}
        </div>
      </div>

      {(agendaGoogle.situacao === "semPermissao" || agendaGoogle.situacao === "apiDesativada" || agendaGoogle.situacao === "erro") && (
        <AvisoFaixa>{agendaGoogle.situacao === "semPermissao" ? T.calendario.googleSemPermissao : agendaGoogle.situacao === "apiDesativada" ? T.calendario.googleApiDesativada : T.calendario.googleErro}</AvisoFaixa>
      )}

      <div className="cal-layout" data-arrastando={arraste?.ativo ? "sim" : undefined}>
        <div className="cal-principal">
          {vista === "mes" && (
            <div className="cal-mes" style={{ gridTemplateRows: `auto repeat(${semanasNoMes}, minmax(118px, 1fr))` }}>
              {T.calendario.diasSemana.map((d, n) => <div key={d} className="cal-mes-cabecalho" data-fds={n >= 5 ? "sim" : "nao"}>{d}</div>)}
              {dias.map((d, n) => {
                const iso = paraISO(d);
                const lista = porDia[iso] ?? [];
                const diarios = diariosPorDia[iso] ?? 0;
                const limite = 3;
                return (
                  <button
                    key={iso}
                    type="button"
                    className="cal-dia"
                    data-dia={iso}
                    data-alvo={alvoDoArraste === iso ? "sim" : undefined}
                    data-fora={!isSameMonth(d, base) ? "sim" : "nao"}
                    data-hoje={iso === hoje ? "sim" : "nao"}
                    data-fds={n % 7 >= 5 ? "sim" : "nao"}
                    data-passado={iso < hoje ? "sim" : "nao"}
                    aria-pressed={iso === diaSelecionado}
                    aria-label={`${formatar(iso, "d 'de' MMMM")}, ${T.calendario.itensNoDia(lista.length + diarios)}`}
                    onClick={() => escolherDia(iso)}
                    onDoubleClick={() => { setDiaSelecionado(iso); setNovo(true); }}
                  >
                    <span className="cal-dia-topo">
                      <span className="cal-dia-numero numero">{d.getDate()}</span>
                      <span className="linha" style={{ gap: 4 }}>
                        {diarios > 0 && <span className="cal-dia-diarios" title={T.calendario.diariosNoDia(diarios)}><Repeat size={10} />{diarios}</span>}
                        {lista.length > limite && <span className="cal-dia-mais">{T.calendario.mais(lista.length - limite)}</span>}
                      </span>
                    </span>
                    {lista.slice(0, limite).map((i) => <Chip key={i.id} i={i} feito={itemFeito(i, registros)} aoAbrir={abrirChip(i)} aoIniciarArraste={i.evento ? iniciarArraste(i) : undefined} />)}
                  </button>
                );
              })}
            </div>
          )}

          {vista === "semana" && (
            <div className="cal-semana">
              {dias.map((d, n) => {
                const iso = paraISO(d);
                const lista = porDia[iso] ?? [];
                return (
                  <button
                    key={iso}
                    type="button"
                    className="cal-semana-dia"
                    data-dia={iso}
                    data-alvo={alvoDoArraste === iso ? "sim" : undefined}
                    data-hoje={iso === hoje ? "sim" : "nao"}
                    data-fds={n >= 5 ? "sim" : "nao"}
                    aria-pressed={iso === diaSelecionado}
                    aria-label={`${formatar(iso, "d 'de' MMMM")}, ${T.calendario.itensNoDia(lista.length)}`}
                    onClick={() => escolherDia(iso)}
                    onDoubleClick={() => { setDiaSelecionado(iso); setNovo(true); }}
                  >
                    <span className="cal-semana-cabecalho">
                      <span className="rotulo-secao">{T.calendario.diasSemana[n]}</span>
                      <span className="cal-dia-numero numero">{d.getDate()}</span>
                    </span>
                    <span className="cal-semana-lista">
                      {lista.map((i) => <Chip key={i.id} i={i} feito={itemFeito(i, registros)} aoAbrir={abrirChip(i)} aoIniciarArraste={i.evento ? iniciarArraste(i) : undefined} />)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {vista === "agenda" && (
            <div className="cal-agenda">
              {diariosNoPeriodo.length > 0 && (
                <div className="cal-agenda-diarios">
                  <span className="linha texto-2" style={{ gap: 6, fontSize: 12 }}><Repeat size={13} />{T.calendario.todoDia}</span>
                  <div className="cal-agenda-chips">{diariosNoPeriodo.map((i) => <Chip key={i.id} i={i} feito={itemFeito(i, registros)} aoAbrir={abrirChip(i)} />)}</div>
                </div>
              )}
              {agrupadoAgenda.length === 0 ? (
                <Cartao><Vazio icone={<CalendarDays size={28} />} titulo={T.calendario.semItens} /></Cartao>
              ) : agrupadoAgenda.map(([dia, lista]) => (
                <div key={dia} className="cal-agenda-dia" data-hoje={dia === hoje ? "sim" : "nao"} data-selecionado={dia === diaSelecionado ? "sim" : "nao"}>
                  <button type="button" className="cal-agenda-data" onClick={() => setDiaSelecionado(dia)}>
                    <span className="cal-agenda-numero numero">{formatar(dia, "d")}</span>
                    <span className="texto-2" style={{ textTransform: "capitalize" }}>{formatar(dia, "EEE")}</span>
                    <span className="texto-3" style={{ fontSize: 11, textTransform: "capitalize" }}>{formatar(dia, "MMM")}</span>
                  </button>
                  <div className="cal-agenda-itens">
                    {lista.map((i) => <LinhaDoDia key={i.id} {...propsDaLinha(i)} i={i} />)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <aside className="cal-lateral">
          {sugerirGoogle && (
            <div className="cal-integracao">
              <Marca marca="agenda" tamanho={22} />
              <div className="coluna" style={{ gap: 2, minWidth: 0 }}>
                <b>{T.conexoes.servicos.agenda.nome}</b>
                <span className="texto-3">{T.calendario.integracaoTexto}</span>
              </div>
              <Botao pequeno variante="primario" onClick={() => irPara("conexoes", { servico: "agenda" })}>{T.calendario.integracaoConectar}</Botao>
              <Botao pequeno soIcone variante="fantasma" icone={<X size={14} />} aria-label={T.calendario.integracaoEsconder} title={T.calendario.integracaoEsconder} onClick={() => definirConfig({ sugestaoAgendaGoogle: false })} />
            </div>
          )}
          <Cartao className="cal-painel">
            <div className="cal-painel-topo">
              <div className="cal-painel-data">
                <span className="cal-painel-numero numero">{formatar(diaSelecionado, "d")}</span>
                <div className="coluna" style={{ gap: 0 }}>
                  <b style={{ textTransform: "capitalize" }}>{formatar(diaSelecionado, "EEEE")}</b>
                  <span className="texto-3" style={{ fontSize: 12, textTransform: "capitalize" }}>{formatar(diaSelecionado, "MMMM yyyy")}</span>
                </div>
              </div>
              <div className="linha" style={{ gap: 6 }}>
                {diaSelecionado === hoje && <span className="etiqueta etiqueta-destaque">{T.geral.hoje}</span>}
                <Botao pequeno soIcone icone={<Plus size={14} />} aria-label={T.calendario.novoEvento} onClick={() => setNovo(true)} />
              </div>
            </div>

            <form className="cal-rapido" onSubmit={(e) => { e.preventDefault(); criarRapido(); }}>
              <input className="campo" value={rapido} maxLength={140} placeholder={T.calendario.rapido} aria-label={T.calendario.rapidoRotulo} onChange={(e) => setRapido(e.target.value)} />
              <Botao type="submit" pequeno soIcone variante="fantasma" icone={<CornerDownLeft size={14} />} aria-label={T.geral.criar} disabled={!rapido.trim()} />
            </form>

            {doDia.length === 0 && diariosDoDia.length === 0 ? (
              <p className="texto-3 cal-painel-vazio">{T.calendario.diaLivre}</p>
            ) : (
              <div className="coluna" style={{ gap: 14 }}>
                {diaTodo.length > 0 && (
                  <div className="coluna" style={{ gap: 6 }}>
                    <span className="rotulo-secao">{T.calendario.diaTodo}</span>
                    {diaTodo.map((i) => <LinhaDoDia key={i.id} {...propsDaLinha(i)} i={i} />)}
                  </div>
                )}
                {comHora.length > 0 && (
                  <div className="coluna" style={{ gap: 6 }}>
                    <span className="rotulo-secao">{T.calendario.comHorario}</span>
                    {comHora.map((i) => <LinhaDoDia key={i.id} {...propsDaLinha(i)} i={i} />)}
                  </div>
                )}
                {diariosDoDia.length > 0 && (
                  <div className="coluna" style={{ gap: 6 }}>
                    <span className="rotulo-secao linha" style={{ gap: 6 }}><Repeat size={12} />{T.calendario.todoDia}</span>
                    {diariosDoDia.map((i) => <LinhaDoDia key={i.id} {...propsDaLinha(i)} i={i} />)}
                  </div>
                )}
              </div>
            )}
            <p className="campo-dica">{T.calendario.dicaDuplo}</p>
          </Cartao>

          <Cartao titulo={T.calendario.proximos} icone={<CalendarDays size={16} />}>
            {proximos.length === 0 && diariosProximos.length === 0 ? <p className="texto-3">{T.calendario.semProximos}</p> : (
              <div className="cal-proximos">
                {diariosProximos.length > 0 && (
                  <div className="cal-proximos-diarios">
                    <Repeat size={12} />
                    <span className="cortar privado">{diariosProximos.map((i) => (i.hora ? `${i.hora} ${i.titulo}` : i.titulo)).join(", ")}</span>
                  </div>
                )}
                {proximos.slice(0, 8).map((i) => (
                  <button key={i.id} type="button" className="cal-proximo" data-feito={itemFeito(i, registros) ? "sim" : undefined} style={corDa(i.fonte)} onClick={() => { setFoco(i.data); setDiaSelecionado(i.data); }}>
                    <span className="cal-proximo-dia">
                      <span className="numero">{formatar(i.data, "d")}</span>
                      <span>{formatar(i.data, "EEE")}</span>
                    </span>
                    <span className="cal-linha-barra" />
                    <span className="coluna" style={{ gap: 0, minWidth: 0 }}>
                      <span className="cortar privado">{i.titulo}</span>
                      <span className="texto-3" style={{ fontSize: 11 }}>{[i.data === hoje ? T.geral.hoje : "", i.hora, T.calendario.fontes[i.fonte]].filter(Boolean).join(" . ")}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </Cartao>
        </aside>
      </div>
      {arraste?.ativo && (
        <div className="cal-chip cal-chip-fantasma" style={{ ...corDa(arraste.item.fonte), left: arraste.x + 10, top: arraste.y + 10 }} aria-hidden="true">
          {arraste.item.hora && <span className="cal-chip-hora numero">{arraste.item.hora}</span>}
          <span className="cortar privado">{arraste.item.titulo}</span>
        </div>
      )}
      <FormEvento aberto={novo || Boolean(edicao)} dataInicial={diaSelecionado} edicao={edicao} aoSalvar={salvarForm} aoFechar={fecharForm} />
      <EscolhaDeEscopo pedido={escopo} aoFechar={() => setEscopo(null)} />
    </>
  );
}
