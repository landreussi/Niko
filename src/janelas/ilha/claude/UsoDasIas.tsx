import { useEffect, useState } from "react";
import { lerConsumo, type UsoFerramenta } from "../../../ponte/ponteLocal";
import { useConfig } from "../../../estado/configuracoes";
import { faltaPara, nivelDoUso, rotuloJanela } from "../../../utilitarios/consumo";
import { T } from "../../../textos/textos";

const C = T.ilha.claude;
const INTERVALO_MS = 60_000;
// Só as janelas que todo provedor tem: a sessão curta e a semana.
const JANELAS = ["sessao", "semanal"] as const;
const COR_DA_FERRAMENTA: Record<string, string> = { claude: "#d97757", codex: "#5b8def" };

export function UsoDasIas() {
  const lerPlanos = useConfig((s) => s.consumo.lerPlanos);
  const [ferramentas, setFerramentas] = useState<UsoFerramenta[]>([]);

  useEffect(() => {
    if (!lerPlanos) {
      setFerramentas([]);
      return;
    }
    let vivo = true;
    const ler = () => {
      if (document.hidden) return;
      lerConsumo()
        .then((r) => vivo && setFerramentas(r.ferramentas.filter((f) => f.situacao === "ok" && f.janelas.length > 0)))
        .catch(() => undefined);
    };
    ler();
    const t = window.setInterval(ler, INTERVALO_MS);
    return () => {
      vivo = false;
      window.clearInterval(t);
    };
  }, [lerPlanos]);

  if (ferramentas.length === 0) return null;

  return (
    <div className="ias-uso" aria-label={C.uso.titulo}>
      {ferramentas.map((f) => (
        <span key={f.id} className="ias-uso-ferramenta">
          <span className="ias-uso-ponto" style={{ background: COR_DA_FERRAMENTA[f.id] ?? "rgba(var(--i-rgb), 0.5)" }} />
          <b>{C.uso.nomes[f.id] ?? f.nome}</b>
          {JANELAS.map((id) => {
            const j = f.janelas.find((x) => x.id === id);
            if (!j) return null;
            const usado = Math.round(j.usado);
            return (
              <span key={id} className="ias-uso-janela" data-nivel={nivelDoUso(j.usado)} title={C.uso.dica(f.nome, rotuloJanela(j.rotulo), usado, faltaPara(j.reiniciaEm))}>
                <span className="ias-uso-rotulo">{C.uso.curtos[id]}</span>
                <span className="ias-uso-trilho" aria-hidden="true">
                  <span style={{ width: `${Math.max(4, usado)}%` }} />
                </span>
                <span className="ias-uso-pct">{usado}%</span>
              </span>
            );
          })}
        </span>
      ))}
    </div>
  );
}
