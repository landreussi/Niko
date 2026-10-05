import { useEffect, useRef, useState } from "react";
import { Bluetooth, ExternalLink, RefreshCw } from "lucide-react";
import { sistema, type AparelhoBluetooth } from "../../../ponte/ponteLocal";
import { T } from "../../../textos/textos";

const S = T.ilha.sistema;

export function ListaDeBluetooth() {
  const [aparelhos, setAparelhos] = useState<AparelhoBluetooth[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const atualizar = useRef<() => void>(() => undefined);

  useEffect(() => {
    let vivo = true;
    let lendo = false;
    const ler = async () => {
      if (lendo || !vivo) return;
      lendo = true;
      setOcupado(true);
      try {
        const lista = await sistema.bluetooth();
        if (vivo) {
          setAparelhos(lista);
          setErro(null);
        }
      } catch {
        if (vivo) setErro(S.semPonte);
      } finally {
        lendo = false;
        if (vivo) setOcupado(false);
      }
    };
    atualizar.current = () => void ler();
    void ler();
    const relogio = window.setInterval(() => void ler(), 5000);
    return () => {
      vivo = false;
      window.clearInterval(relogio);
      atualizar.current = () => undefined;
    };
  }, []);

  const abrirWindows = async () => {
    setErro(null);
    try {
      await sistema.configuracoes("bluetooth");
    } catch {
      setErro(S.semPonte);
    }
  };

  return (
    <section className="ilha-rapido-redes ilha-rapido-bluetooth" aria-label={S.aparelhos} aria-busy={ocupado}>
      {aparelhos === null && !erro && <p className="ilha-rapido-vazio">{T.geral.carregando}</p>}
      {aparelhos?.length === 0 && <p className="ilha-rapido-vazio">{S.semAparelhos}</p>}
      <div className="ilha-rapido-bluetooth-lista">
        {aparelhos?.map((aparelho) => (
          <div key={aparelho.id} className="ilha-rapido-rede" data-atual={aparelho.conectado === true || undefined}>
            <div className="ilha-rapido-linha">
              <span className="ilha-rapido-icone" aria-hidden="true"><Bluetooth size={14} /></span>
              <span className="ilha-rapido-rede-nome ilha-rapido-bluetooth-nome">
                <span className="cortar" title={aparelho.nome}>{aparelho.nome}</span>
                <small>{aparelho.conectado === true ? S.bluetoothConectado : aparelho.conectado === false ? S.bluetoothDesconectado : S.bluetoothEstadoDesconhecido}</small>
              </span>
              <button type="button" className="ilha-rapido-texto ilha-rapido-texto-pequeno" onClick={() => void abrirWindows()}>
                {aparelho.conectado === true ? S.desconectarBluetoothWindows : aparelho.conectado === false ? S.conectarBluetoothWindows : S.gerenciarBluetoothWindows}
                <ExternalLink size={11} />
              </button>
            </div>
          </div>
        ))}
      </div>
      {erro && <p className="ilha-rapido-vazio ilha-rapido-erro" role="alert">{erro}</p>}
      <p className="ilha-rapido-vazio">{S.bluetoothDicaWindows}</p>
      <div className="ilha-rapido-redes-rodape">
        <button type="button" className="ilha-rapido-icone" disabled={ocupado} aria-label={S.atualizar} title={S.atualizar} onClick={() => atualizar.current()}><RefreshCw size={13} /></button>
        <button type="button" className="ilha-rapido-icone" aria-label={S.abrirWindows} title={S.abrirWindows} onClick={() => void abrirWindows()}><ExternalLink size={13} /></button>
      </div>
    </section>
  );
}
