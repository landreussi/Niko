import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ListTodo, Zap, Music, Timer, Repeat, CalendarClock, MessageCircle, Plug, Users, Bell, Volume2, VolumeX, AppWindow, ChevronUp, Check, CircleAlert, Laptop, Download,
  type LucideIcon,
} from "lucide-react";
import { useConfig, type AbaIlha } from "../../estado/configuracoes";
import { useIlha } from "../../estado/ilha";
import { useInterface } from "../../estado/interface";
import { useAgentes, AGENTES, estadoDoAgente, alertaFresco } from "../../estado/agentes";
import { usePomodoro, restanteAtual, formatarRelogio } from "../../estado/pomodoro";
import { useMidia, fundoDaCapa } from "../../estado/midia";
import { Personagem } from "../../personagens/Personagem";
import { Marca } from "../../marcas/Marca";
import { Anel } from "../../componentes/Graficos";
import { T } from "../../textos/textos";
import { tocarSom } from "../../ponte/sons";
import {
  VisaoHoje, VisaoCaptura, VisaoMidia, VisaoFoco, VisaoHabitos, VisaoAgenda, VisaoConexoes, VisaoTime, VisaoAvisos,
} from "./Visoes";
import { alguemCobre } from "../geometria";
import { VisaoSistema } from "./VisaoSistema";
import { VisaoChat } from "./VisaoChat";
import { useAtualizacao } from "../../estado/atualizacao";
import { NATIVO, usarAreaInterativa, usarCursorFora, usarEstadoDaFrente } from "../../desktop/desktop";
import { sistema } from "../../ponte/ponteLocal";
import type { AgenteId, EstadoAgente } from "../../tipos";
import "./ilha.css";

const ICONE_ABA: Record<AbaIlha, LucideIcon> = {
  hoje: ListTodo,
  captura: Zap,
  midia: Music,
  foco: Timer,
  habitos: Repeat,
  agenda: CalendarClock,
  chat: MessageCircle,
  conexoes: Plug,
  sistema: Laptop,
  time: Users,
  avisos: Bell,
};

const VISAO_ABA: Record<AbaIlha, () => React.JSX.Element> = {
  hoje: VisaoHoje,
  captura: VisaoCaptura,
  midia: VisaoMidia,
  foco: VisaoFoco,
  habitos: VisaoHabitos,
  agenda: VisaoAgenda,
  chat: VisaoChat,
  conexoes: VisaoConexoes,
  sistema: VisaoSistema,
  time: VisaoTime,
  avisos: VisaoAvisos,
};

const ALTURA_ABA: Record<AbaIlha, number> = {
  hoje: 250,
  captura: 168,
  midia: 156,
  foco: 176,
  habitos: 230,
  agenda: 220,
  chat: 300,
  conexoes: 270,
  sistema: 330,
  time: 214,
  avisos: 178,
};

const ESCALA = { pequena: 0.85, media: 1, grande: 1.15 };

function estadoCalmo(e: EstadoAgente): EstadoAgente {
  return e === "alerta" || e === "erro" ? "ocioso" : e;
}
const LARGURA_EXPANDIDA = 660;
const AGENTE_DA_ABA: Partial<Record<AbaIlha, AgenteId>> = { hoje: "organizador", habitos: "organizador", agenda: "organizador", foco: "organizador", conexoes: "java", sistema: "operador" };
const MOLA = { type: "spring" as const, visualDuration: 0.5, bounce: 0.2 };
const FECHAR = { duration: 0.34, ease: [0.45, 0, 0.2, 1] as [number, number, number, number] };

function useAgora(intervalo: number, ativo: boolean) {
  const [agora, setAgora] = useState(Date.now());
  useEffect(() => {
    if (!ativo) return;
    setAgora(Date.now());
    const t = window.setInterval(() => setAgora(Date.now()), intervalo);
    return () => window.clearInterval(t);
  }, [intervalo, ativo]);
  return agora;
}

export function Ilha() {
  const cfg = useConfig((s) => s.ilha);
  const somLigado = useConfig((s) => s.sons.ligado);
  const definirConfig = useConfig((s) => s.definir);
  const sons = useConfig((s) => s.sons);
  const favorito = useConfig((s) => s.agentes.favorito);
  const nomes = useConfig((s) => s.agentes.nomes);
  const cargos = useConfig((s) => s.agentes.cargos);
  const privacidade = useConfig((s) => s.privacidade);
  const estado = useIlha((s) => s.estado);
  const aba = useIlha((s) => s.aba);
  const revelacao = useIlha((s) => s.revelacao);
  const definirEstado = useIlha((s) => s.definirEstado);
  const abrir = useIlha((s) => s.abrir);
  const recolher = useIlha((s) => s.recolher);
  useInterface((s) => s.sistemaMaximizado);
  useInterface((s) => s.geometria);
  useInterface((s) => s.janelasConexao);
  const [revelada, setRevelada] = useState(false);
  useInterface((s) => s.sistemaAberto);
  useInterface((s) => s.sistemaMinimizado);
  const irPara = useInterface((s) => s.irPara);
  const agentes = useAgentes();
  const pomodoro = usePomodoro();
  const midia = useMidia();
  const raiz = useRef<HTMLDivElement>(null);
  const [sobre, setSobre] = useState(false);
  const atualizacao = useAtualizacao();
  useEffect(() => {
    const primeira = window.setTimeout(() => void useAtualizacao.getState().verificar(), 15000);
    const sempre = window.setInterval(() => void useAtualizacao.getState().verificar(), 6 * 3600000);
    return () => {
      window.clearTimeout(primeira);
      window.clearInterval(sempre);
    };
  }, []);
  usarAreaInterativa([".ilha-raiz .ilha", ".ilha-gatilho"]);
  usarCursorFora(useCallback(() => setSobre(false), []));
  const [restanteFechar, setRestanteFechar] = useState<number | null>(null);
  const anterior = useRef({ w: 0, h: 0 });
  const relogioHover = useRef<number | undefined>(undefined);
  const relogioRevelada = useRef<number | undefined>(undefined);
  useEffect(
    () => () => {
      window.clearTimeout(relogioHover.current);
      window.clearTimeout(relogioRevelada.current);
    },
    [],
  );

  const [notebook, setNotebook] = useState(false);
  useEffect(() => {
    void sistema.tipo().then((t) => setNotebook(t.notebook));
  }, []);
  const abas = cfg.ordemAbas.filter((a) => cfg.blocos[a] && (a !== "sistema" || notebook));
  const abaAtual = abas.includes(aba) ? aba : abas[0] ?? "hoje";
  const frente = usarEstadoDaFrente(cfg.ativa);
  const coberta = cfg.modo === "inteligente" && !revelada && (NATIVO ? frente.cobre : alguemCobre({ x: (window.innerWidth - LARGURA_EXPANDIDA) / 2, y: 0, w: LARGURA_EXPANDIDA, h: 40 }));
  const pomodoroIniciado = pomodoro.rodando || pomodoro.restanteMs != null;
  const agora = useAgora(1000, pomodoro.rodando && estado !== "expandida");
  const relogio = useAgora(15000, cfg.repouso === "relogio" || cfg.repouso === "agente");
  const alertas = agentes.alertas;
  const naoVistos = alertas.filter((a) => !a.visto).length;
  const frescos = alertas.filter((a) => alertaFresco(a, agentes.relogio)).length;
  const trabalhando = AGENTES.filter((a) => ["pensando", "escrevendo"].includes(estadoDoAgente(agentes, a)));

  const estadoEfetivo = coberta && estado !== "expandida" && !revelacao ? "escondida" : cfg.modo === "fixo" && estado === "escondida" ? "compacta" : estado;

  useEffect(() => {
    if (cfg.modo !== "esconder" || estadoEfetivo !== "compacta" || sobre || revelacao || frescos > 0 || pomodoro.rodando || atualizacao.fase !== "nada") return;
    const t = window.setTimeout(() => definirEstado("escondida"), cfg.esconderSeg * 1000);
    return () => window.clearTimeout(t);
  }, [cfg.modo, cfg.esconderSeg, estadoEfetivo, sobre, revelacao, frescos, pomodoro.rodando, definirEstado, atualizacao.fase]);

  useEffect(() => {
    if (estado === "expandida" && abaAtual === "avisos") useAgentes.getState().marcarVistos();
  }, [estado, abaAtual, alertas.length]);

  useEffect(() => {
    if (estadoEfetivo !== "expandida" || sobre || cfg.fechamentoSeg === 0) {
      setRestanteFechar(null);
      return;
    }
    const fim = Date.now() + cfg.fechamentoSeg * 1000;
    const t = window.setInterval(() => {
      const focoDentro = raiz.current?.contains(document.activeElement) && document.activeElement?.tagName === "INPUT";
      if (focoDentro) return;
      const r = fim - Date.now();
      if (r <= 0) {
        recolher();
        void tocarSom("close");
        setRestanteFechar(null);
        return;
      }
      setRestanteFechar(r);
    }, 100);
    return () => window.clearInterval(t);
  }, [estadoEfetivo, sobre, cfg.fechamentoSeg, recolher]);

  useEffect(() => {
    if (estadoEfetivo !== "expandida") return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        recolher();
        void tocarSom("close");
      }
    };
    const aoClicarFora = (e: PointerEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) recolher();
    };
    window.addEventListener("keydown", aoTeclar);
    window.addEventListener("pointerdown", aoClicarFora, true);
    return () => {
      window.removeEventListener("keydown", aoTeclar);
      window.removeEventListener("pointerdown", aoClicarFora, true);
    };
  }, [estadoEfetivo, recolher]);

  useEffect(() => {
    if (!frente.telaCheia) return;
    window.clearTimeout(relogioHover.current);
    setRevelada(false);
    if (useIlha.getState().estado === "expandida") recolher();
  }, [frente.telaCheia, recolher]);

  const compacta = useMemo(() => {
    if (atualizacao.fase !== "nada") return { tipo: "atualizacao" as const, largura: 350 };
    if (revelacao) return { tipo: "revelacao" as const, largura: 340 };
    if (pomodoroIniciado) return { tipo: "pomodoro" as const, largura: midia.tocando ? 330 : 290 };
    if (midia.tocando && midia.faixa) return { tipo: "midia" as const, largura: 330 };
    if (trabalhando.length > 0) return { tipo: "trabalho" as const, largura: 280 };
    if (cfg.repouso === "relogio") return { tipo: "relogio" as const, largura: 190 };
    if (cfg.repouso === "midia") return { tipo: "midia" as const, largura: 330 };
    if (cfg.repouso === "agente") return { tipo: "agente" as const, largura: 230 };
    return { tipo: "nada" as const, largura: 120 };
  }, [revelacao, pomodoroIniciado, midia.tocando, Boolean(midia.faixa), trabalhando.length, cfg.repouso, atualizacao.fase]);

  if (!cfg.ativa || frente.telaCheia) return null;

  const escala = ESCALA[cfg.tamanho];
  const alvo =
    estadoEfetivo === "escondida"
      ? { w: 120, h: 6, r: 6 }
      : estadoEfetivo === "compacta"
        ? { w: compacta.largura, h: 34, r: 14 }
        : { w: LARGURA_EXPANDIDA, h: ALTURA_ABA[abaAtual], r: 30 };
  const crescendo = alvo.w * alvo.h >= anterior.current.w * anterior.current.h;
  anterior.current = { w: alvo.w, h: alvo.h };
  const transicao = crescendo ? MOLA : FECHAR;

  const VisaoAtual = VISAO_ABA[abaAtual];
  const agenteLateral: AgenteId = abaAtual === "avisos" && alertas[0] ? alertas[0].agenteId : AGENTE_DA_ABA[abaAtual] ?? (trabalhando[0] as AgenteId | undefined) ?? favorito;
  const restantePomodoro = restanteAtual(pomodoro, agora);
  const corFundo = cfg.cor === "destaque" ? "color-mix(in srgb, var(--destaque) 82%, #000)" : "#000";

  const abaDaCompacta = (): AbaIlha | undefined =>
    compacta.tipo === "revelacao" ? revelacao?.aba : compacta.tipo === "pomodoro" ? "foco" : compacta.tipo === "midia" ? "midia" : compacta.tipo === "trabalho" ? "time" : undefined;

  const acionarCompacta = () => {
    window.clearTimeout(relogioHover.current);
    if (compacta.tipo === "atualizacao") {
      if (atualizacao.fase === "disponivel" || atualizacao.fase === "erro") void atualizacao.instalar();
      return;
    }
    abrir(abaDaCompacta());
    if (compacta.tipo === "revelacao") useIlha.getState().dispensarRevelacao();
    void tocarSom("open");
  };

  const conteudoCompacta = () => {
    switch (compacta.tipo) {
      case "atualizacao":
        return (
          <>
            <div className="ilha-compacta-lado">
              {atualizacao.fase === "baixando" || atualizacao.fase === "instalando" ? <Anel progresso={atualizacao.progresso} tamanho={18} espessura={2.5} cor="#a78bfa" /> : <Download size={15} color="#a78bfa" />}
            </div>
            <span className="ilha-compacta-texto">
              {atualizacao.fase === "disponivel" ? T.ilha.atualizacao.disponivel(atualizacao.versao) : atualizacao.fase === "baixando" ? T.ilha.atualizacao.baixando(Math.round(atualizacao.progresso * 100)) : atualizacao.fase === "instalando" ? T.ilha.atualizacao.instalando : T.ilha.atualizacao.falhou}
            </span>
            <div className="ilha-compacta-lado">
              {atualizacao.fase === "disponivel" && <span className="ilha-atualizar">{T.ilha.atualizacao.atualizar}</span>}
            </div>
          </>
        );
      case "revelacao":
        return (
          <>
            <div className="ilha-compacta-lado">
              {revelacao?.marca ? <Marca marca={revelacao.marca} tamanho={16} /> : revelacao?.agente ? <Personagem agente={revelacao.agente} tamanho={20} interativo={false} halo={false} /> : null}
            </div>
            <span className="ilha-compacta-texto privado">{revelacao?.texto}</span>
            <div className="ilha-compacta-lado">
              {revelacao?.tipo === "alerta" ? <CircleAlert size={15} color="#f5a524" /> : <Check size={15} color="#34d399" />}
            </div>
          </>
        );
      case "pomodoro":
        return (
          <>
            <div className="ilha-compacta-lado">
              <Anel progresso={1 - restantePomodoro / pomodoro.duracaoMs} tamanho={18} espessura={2.5} cor={pomodoro.etapa === "foco" ? "#f5f6f8" : "#34d399"} />
              <span className="ilha-tempo">{formatarRelogio(restantePomodoro)}</span>
            </div>
            <span className="ilha-compacta-texto" style={{ color: "#8e939c" }}>
              {T.pomodoro.etapas[pomodoro.etapa]}
            </span>
            <div className="ilha-compacta-lado">
              {midia.tocando ? <span className="ilha-capa" style={{ width: 18, height: 18, background: fundoDaCapa(midia.faixa) }} /> : <MiniAgentes ids={trabalhando} />}
            </div>
          </>
        );
      case "midia":
        return (
          <>
            <div className="ilha-compacta-lado">
              <span className="ilha-capa" style={{ width: 20, height: 20, background: fundoDaCapa(midia.faixa) }} />
            </div>
            <span className="ilha-compacta-texto privado">{midia.faixa?.titulo ?? ""}</span>
            <div className="ilha-compacta-lado">
              <span className={`ilha-onda ${midia.tocando ? "" : "parada"}`}>
                <i />
                <i />
                <i />
                <i />
              </span>
            </div>
          </>
        );
      case "trabalho":
        return (
          <>
            <MiniAgentes ids={trabalhando} />
            <span className="ilha-compacta-texto brilho-texto">{agentes.tarefaAtual[trabalhando[0]] || T.agentes.estados.escrevendo}</span>
          </>
        );
      case "relogio":
        return <span className="ilha-compacta-texto ilha-tempo">{new Date(relogio).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>;
      case "agente":
        return (
          <>
            <div className="ilha-compacta-lado">
              <Personagem agente={favorito} tamanho={22} interativo={false} halo={false} estado={estadoCalmo(estadoDoAgente(agentes, favorito))} />
            </div>
            <span className="ilha-compacta-texto ilha-relogio">
              <span className="ilha-tempo">{new Date(relogio).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
              <span className="ilha-mini">{new Date(relogio).toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short" }).replace(/\./g, "")}</span>
            </span>
            <div className="ilha-compacta-lado" style={{ width: 22 }} />
          </>
        );      default:
        return null;
    }
  };

  return (
    <>
      {estadoEfetivo === "escondida" && (
        <div
          className="ilha-gatilho"
          onDragEnter={(e) => {
            if (!Array.from(e.dataTransfer.types).includes("Files")) return;
            setRevelada(true);
            abrir("chat");
          }}
          onPointerEnter={() => {
            setRevelada(true);
            definirEstado("compacta");
            void tocarSom("peek");
          }}
        />
      )}
      <div
        ref={raiz}
        className="ilha-raiz"
        data-privacidade={privacidade ? "sim" : "nao"}
        style={{ transform: `translateX(-50%) scale(${escala})`, transformOrigin: "top center", opacity: coberta && estadoEfetivo === "escondida" ? 0 : 1 }}
        onPointerEnter={() => {
          setSobre(true);
          window.clearTimeout(relogioRevelada.current);
        }}
        onDragEnter={(e) => {
          if (!Array.from(e.dataTransfer.types).includes("Files")) return;
          if (useIlha.getState().estado !== "expandida" || useIlha.getState().aba !== "chat") {
            abrir("chat");
            void tocarSom("open");
          }
        }}
        onPointerLeave={() => {
          setSobre(false);
          window.clearTimeout(relogioHover.current);
          window.clearTimeout(relogioRevelada.current);
          if (revelada) relogioRevelada.current = window.setTimeout(() => setRevelada(false), 1500);
        }}
      >
        <motion.div
          className="ilha"
          style={{ ["--fundo-ilha" as string]: corFundo }}
          initial={false}
          animate={{ width: alvo.w, height: alvo.h, borderBottomLeftRadius: alvo.r, borderBottomRightRadius: alvo.r }}
          transition={transicao}
        >
          <div className="ilha-recorte">
            <AnimatePresence mode="popLayout" initial={false}>
              {estadoEfetivo === "compacta" && (
                <motion.div
                  key={`c-${compacta.tipo}`}
                  className="ilha-compacta"
                  role="button"
                  tabIndex={0}
                  aria-label={T.ilha.expandir}
                  initial={{ opacity: 0, filter: "blur(8px)", scale: 0.97 }}
                  animate={{ opacity: 1, filter: "blur(0px)", scale: 1, transition: { delay: 0.16, duration: 0.3 } }}
                  exit={{ opacity: 0, filter: "blur(8px)", scale: 0.97, transition: { duration: 0.16 } }}
                  onClick={acionarCompacta}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      acionarCompacta();
                    }
                  }}
                  onPointerEnter={() => {
                    window.clearTimeout(relogioHover.current);
                    if (cfg.abrirHover && compacta.tipo !== "atualizacao") relogioHover.current = window.setTimeout(() => useIlha.getState().estado === "compacta" && abrir(abaDaCompacta()), 280);
                  }}
                  onPointerLeave={() => window.clearTimeout(relogioHover.current)}
                >
                  {["pomodoro", "midia", "relogio", "nada"].includes(compacta.tipo) && (
                    <div className="ilha-compacta-lado">
                      <Personagem agente={favorito} tamanho={22} interativo={false} halo={false} estado={estadoCalmo(estadoDoAgente(agentes, favorito))} />
                    </div>
                  )}
                  {conteudoCompacta()}
                  {compacta.tipo !== "revelacao" && naoVistos > 0 && (
                    <span className="ilha-contador" aria-label={T.ilha.fila(naoVistos)} title={T.ilha.fila(naoVistos)}>{naoVistos}</span>
                  )}
                </motion.div>
              )}
              {estadoEfetivo === "expandida" && (
                <motion.div
                  key="expandida"
                  className="ilha-expandida"
                  initial={{ opacity: 0, filter: "blur(8px)", scale: 0.97 }}
                  animate={{ opacity: 1, filter: "blur(0px)", scale: 1, transition: { delay: 0.16, duration: 0.3 } }}
                  exit={{ opacity: 0, filter: "blur(8px)", scale: 0.97, transition: { duration: 0.16 } }}
                >
                  <div className="ilha-cabecalho">
                    <div className="ilha-abas" role="tablist" aria-label={T.app.nome}>
                      {abas.map((a, i) => {
                        const Icone = ICONE_ABA[a];
                        return (
                          <motion.button
                            key={a}
                            type="button"
                            role="tab"
                            className="ilha-aba"
                            aria-selected={a === abaAtual}
                            aria-label={T.ilha.abas[a]}
                            title={T.ilha.abas[a]}
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0, transition: { delay: 0.3 + i * 0.035 } }}
                            onClick={() => {
                              if (a !== abaAtual) void tocarSom("blip");
                              abrir(a);
                            }}
                          >
                            <Icone size={14} />
                            {a === "avisos" && naoVistos > 0 && <span className="ilha-aba-selo">{naoVistos}</span>}
                          </motion.button>
                        );
                      })}
                    </div>
                    <div className="ilha-acoes">
                      <button
                        type="button"
                        className="ilha-acao"
                        aria-label={somLigado ? T.ilha.silenciar : T.ilha.ativarSom}
                        title={somLigado ? T.ilha.silenciar : T.ilha.ativarSom}
                        onClick={() => definirConfig({ sons: { ...sons, ligado: !somLigado } })}
                      >
                        {somLigado ? <Volume2 size={14} /> : <VolumeX size={14} />}
                      </button>
                      <button
                        type="button"
                        className="ilha-acao"
                        aria-label={T.ilha.abrirSistema}
                        title={T.ilha.abrirSistema}
                        onClick={() => {
                          const rota = { hoje: "journal", captura: "inicio", midia: "inicio", foco: "estudos", habitos: "journal", agenda: "calendario", chat: "chat", conexoes: "conexoes", sistema: "configuracoes", time: "escritorio", avisos: "inicio" } as const;
                          irPara(rota[abaAtual]);
                          recolher();
                          void tocarSom("open");
                        }}
                      >
                        <AppWindow size={14} />
                      </button>
                      <button type="button" className="ilha-acao" aria-label={T.ilha.fecharIlha} title={T.ilha.fecharIlha} onClick={() => recolher()}>
                        <ChevronUp size={14} />
                      </button>
                    </div>
                  </div>
                  <div className="ilha-miolo">
                  {abaAtual !== "time" && abaAtual !== "chat" && <motion.div className="ilha-lateral" initial={{ opacity: 0, x: -10, scale: 0.8 }} animate={{ opacity: 1, x: 0, scale: 1, transition: { delay: 0.2, type: "spring", visualDuration: 0.45, bounce: 0.3 } }}>
                    <Personagem agente={agenteLateral} tamanho={ALTURA_ABA[abaAtual] < 200 ? 50 : 70} halo={false} rotulo={nomes[agenteLateral]} />
                    <span className="ilha-lateral-nome cortar">{nomes[agenteLateral]}</span>
                    <span className="ilha-lateral-cargo" title={cargos[agenteLateral]}>{cargos[agenteLateral]}</span>
                  </motion.div>}
                  <div className="ilha-visoes">
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.div
                        key={abaAtual}
                        className="ilha-visao"
                        initial={{ opacity: 0, scale: 0.97, filter: "blur(6px)" }}
                        animate={{ opacity: 1, scale: 1, filter: "blur(0px)", transition: { duration: 0.24, ease: [0.3, 1.2, 0.4, 1] } }}
                        exit={{ opacity: 0, scale: 0.97, filter: "blur(6px)", transition: { duration: 0.12 } }}
                      >
                        <VisaoAtual />
                      </motion.div>
                    </AnimatePresence>
                  </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          {restanteFechar != null && restanteFechar <= 10000 && (
            <span className="ilha-contagem" style={{ width: (restanteFechar / 10000) * 160 }} aria-hidden="true" />
          )}
        </motion.div>
      </div>
    </>
  );
}

function MiniAgentes({ ids }: { ids: string[] }) {
  return (
    <div className="ilha-compacta-lado" style={{ gap: 2 }}>
      {ids.slice(0, 3).map((id, i) => (
        <motion.span key={id} initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1, transition: { delay: i * 0.035 } }}>
          <Personagem agente={id as (typeof AGENTES)[number]} tamanho={20} interativo={false} halo={false} />
        </motion.span>
      ))}
    </div>
  );
}
