import { ArrowDown, ArrowUp, RotateCcw, X } from "lucide-react";
import { Botao, Campo, LinhaAlternador } from "../../componentes/basicos";
import { useConfig } from "../../estado/configuracoes";
import { ASSISTIVE_PADRAO, moverAtalho } from "../../janelas/assistive/regras";
import { T } from "../../textos/textos";

export function SecaoAssistive() {
  const cfg = useConfig((s) => s.assistive);
  const definir = useConfig((s) => s.definirAssistive);
  const C = T.assistive;
  return <div className="coluna" style={{ gap: 16 }}>
    <p className="campo-dica">{C.dicaConfiguracao}</p>
    <LinhaAlternador rotulo={C.ativar} ligado={cfg.ativo} aoMudar={(ativo) => definir({ ativo })} />
    <LinhaAlternador rotulo={C.fixar} ligado={cfg.fixado} aoMudar={(fixado) => definir({ fixado })} />
    <Campo id="assistive-cor" rotulo={C.origemCor}><select id="assistive-cor" className="seletor" value={cfg.origemCor} onChange={(e) => definir({ origemCor: e.target.value as "ilha" | "dock" })}><option value="ilha">{C.ilha}</option><option value="dock">{C.dock}</option></select></Campo>
    <Campo id="assistive-opacidade" rotulo={C.opacidade}><div className="linha" style={{ gap: 12 }}><input id="assistive-opacidade" type="range" min={0.3} max={1} step={0.05} value={cfg.opacidade} onChange={(e) => definir({ opacidade: Number(e.target.value) })} /><output>{Math.round(cfg.opacidade * 100)}%</output></div></Campo>
    <Botao variante="secundario" icone={<RotateCcw size={15} />} onClick={() => definir({ posicao: { ...ASSISTIVE_PADRAO.posicao } })}>{C.restaurarPosicao}</Botao>
    {cfg.apps.length > 0 && <div className="coluna" style={{ gap: 8 }}><b className="campo-rotulo">{C.editar}</b>{cfg.apps.map((app, i) => <div key={app.id} className="linha" style={{ gap: 8 }}><span style={{ flex: 1 }}>{app.nome}</span><Botao pequeno variante="fantasma" soIcone icone={<ArrowUp size={14} />} aria-label={C.anterior(app.nome)} disabled={i === 0} onClick={() => definir({ apps: moverAtalho(useConfig.getState().assistive.apps, app.id, -1) })} /><Botao pequeno variante="fantasma" soIcone icone={<ArrowDown size={14} />} aria-label={C.proximo(app.nome)} disabled={i === cfg.apps.length - 1} onClick={() => definir({ apps: moverAtalho(useConfig.getState().assistive.apps, app.id, 1) })} /><Botao pequeno variante="fantasma" soIcone icone={<X size={14} />} aria-label={C.remover(app.nome)} onClick={() => definir({ apps: useConfig.getState().assistive.apps.filter((a) => a.id !== app.id) })} /></div>)}</div>}
  </div>;
}
