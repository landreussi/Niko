import { useEffect, useState } from "react";
import { Botao, Tecla } from "../../componentes/basicos";
import { useConfig } from "../../estado/configuracoes";
import { pausarAtalhosGlobais, useSituacaoDosAtalhos } from "../../desktop/usarAtalhosGlobais";
import { ACOES_GLOBAIS, ATALHOS_PADRAO, formatarTeclas, teclasDoEvento, type AcaoGlobal } from "../../utilitarios/atalhos";
import { T } from "../../textos/textos";

const A = T.configuracoes.atalhosGlobais;
const SO_MODIFICADORES = new Set(["ControlLeft", "ControlRight", "AltLeft", "AltRight", "ShiftLeft", "ShiftRight", "MetaLeft", "MetaRight"]);

export function EditorDeAtalhos() {
  const atalhos = useConfig((s) => s.atalhosGlobais);
  const definir = useConfig((s) => s.definir);
  const situacoes = useSituacaoDosAtalhos((s) => s.situacoes);
  const [gravando, setGravando] = useState<AcaoGlobal | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const mudar = (acao: AcaoGlobal, teclas: string) => definir({ atalhosGlobais: { ...useConfig.getState().atalhosGlobais, [acao]: teclas } });

  useEffect(() => {
    if (!gravando) return;
    void pausarAtalhosGlobais(true);
    return () => void pausarAtalhosGlobais(false);
  }, [gravando]);

  useEffect(() => {
    if (!gravando) return;
    const aoTeclar = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setGravando(null);
        setAviso(null);
        return;
      }
      if (SO_MODIFICADORES.has(e.code)) return;
      const teclas = teclasDoEvento(e);
      if (!teclas) {
        setAviso(A.precisaModificador);
        return;
      }
      setAviso(null);
      setGravando(null);
      mudar(gravando, teclas);
    };
    window.addEventListener("keydown", aoTeclar, true);
    return () => window.removeEventListener("keydown", aoTeclar, true);
  }, [gravando]);

  return (
    <div className="lista" role="list" aria-label={A.titulo}>
      {ACOES_GLOBAIS.map((acao) => {
        const teclas = atalhos[acao];
        const situacao = situacoes[acao];
        const problema = situacao ? A.situacoes[situacao] : "";
        return (
          <div key={acao} className="lista-item" role="listitem">
            <span className="lista-item-principal">
              <span className="lista-item-titulo">{A.acoes[acao]}</span>
              {gravando === acao && aviso && <span className="lista-item-sub" style={{ whiteSpace: "normal" }}>{aviso}</span>}
              {gravando !== acao && problema && (
                <span className="lista-item-sub" role="alert" style={{ whiteSpace: "normal", color: "var(--erro)" }}>
                  {problema}
                </span>
              )}
            </span>
            <Tecla>{gravando === acao ? A.gravando : teclas ? formatarTeclas(teclas) : A.desligado}</Tecla>
            {gravando === acao ? (
              <Botao pequeno variante="fantasma" onClick={() => setGravando(null)}>
                {A.cancelar}
              </Botao>
            ) : (
              <>
                <Botao pequeno variante="fantasma" onClick={() => setGravando(acao)}>
                  {A.mudar}
                </Botao>
                {teclas && (
                  <Botao pequeno variante="fantasma" onClick={() => mudar(acao, "")}>
                    {A.desligar}
                  </Botao>
                )}
              </>
            )}
          </div>
        );
      })}
      <div className="lista-item">
        <span className="lista-item-principal" />
        <Botao pequeno onClick={() => definir({ atalhosGlobais: ATALHOS_PADRAO })}>
          {A.restaurar}
        </Botao>
      </div>
    </div>
  );
}
