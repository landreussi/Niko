import { useEffect, useRef, useState } from "react";
import { Battery, BatteryCharging, BatteryLow, BatteryMedium, BatteryFull, Sun, Wifi, WifiOff, WifiLow, WifiHigh, Bluetooth, BluetoothOff, Lock, RefreshCw, Headphones, ExternalLink, Check, X } from "lucide-react";
import { sistema, type EstadoSistema, type RedeWifi, type AparelhoBluetooth } from "../../ponte/ponteLocal";
import { tocarSom } from "../../ponte/sons";
import { T } from "../../textos/textos";

const S = T.ilha.sistema;

function IconeBateria({ nivel, carregando }: { nivel: number; carregando: boolean }) {
  if (carregando) return <BatteryCharging size={18} />;
  if (nivel <= 15) return <BatteryLow size={18} />;
  if (nivel <= 60) return <BatteryMedium size={18} />;
  if (nivel <= 95) return <Battery size={18} />;
  return <BatteryFull size={18} />;
}

function IconeSinal({ sinal }: { sinal: number }) {
  if (sinal >= 70) return <Wifi size={14} />;
  if (sinal >= 40) return <WifiHigh size={14} />;
  return <WifiLow size={14} />;
}

function tempo(min: number) {
  const h = Math.floor(min / 60);
  return h ? S.horas(h, min % 60) : S.minutos(min);
}

export function VisaoSistema() {
  const [estado, setEstado] = useState<EstadoSistema | null>(null);
  const [redes, setRedes] = useState<RedeWifi[]>([]);
  const [aparelhos, setAparelhos] = useState<AparelhoBluetooth[]>([]);
  const [lista, setLista] = useState<"redes" | "bluetooth">("redes");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState("");
  const [senhaPara, setSenhaPara] = useState<string | null>(null);
  const [senha, setSenha] = useState("");
  const [brilho, setBrilho] = useState<number | null>(null);
  const envioBrilho = useRef<number | undefined>(undefined);

  const lerEstado = () =>
    sistema
      .estado()
      .then((e) => {
        setEstado(e);
        setBrilho((b) => (envioBrilho.current ? b : e.brilho));
        setErro((atual) => (atual === S.semPonte ? "" : atual));
      })
      .catch(() => setErro(S.semPonte));

  const lerRedes = () => sistema.redes().then(setRedes).catch(() => undefined);
  const lerBluetooth = () => sistema.bluetooth().then(setAparelhos).catch(() => undefined);

  useEffect(() => {
    void lerEstado();
    void lerRedes();
    const t1 = window.setInterval(() => !document.hidden && void lerEstado(), 8000);
    const t2 = window.setInterval(() => !document.hidden && void lerRedes(), 20000);
    return () => {
      window.clearInterval(t1);
      window.clearInterval(t2);
      window.clearTimeout(envioBrilho.current);
    };
  }, []);

  useEffect(() => {
    if (lista === "bluetooth") void lerBluetooth();
  }, [lista]);

  const executar = async (chave: string, acao: () => Promise<unknown>) => {
    setOcupado(chave);
    setErro("");
    try {
      await acao();
      void tocarSom("blip");
    } catch (e) {
      setErro(S.falhou((e as Error).message));
    } finally {
      setOcupado(null);
      void lerEstado();
    }
  };

  const mudarBrilho = (n: number) => {
    setBrilho(n);
    window.clearTimeout(envioBrilho.current);
    envioBrilho.current = window.setTimeout(() => {
      envioBrilho.current = undefined;
      void sistema.brilho(n).catch(() => setErro(S.semBrilho));
    }, 250);
  };

  const conectar = (r: RedeWifi, comSenha?: string) =>
    executar(`rede-${r.ssid}`, async () => {
      await sistema.conectar(r.ssid, comSenha);
      setSenhaPara(null);
      setSenha("");
      await lerRedes();
    });

  if (!estado) return <div className="ilha-cartao"><div className="ilha-cartao-corpo"><span className="ilha-sub">{erro || T.geral.carregando}</span></div></div>;

  const wifiLigado = estado.radios.WiFi ?? estado.wifi.existe;
  const btLigado = estado.radios.Bluetooth ?? false;
  const b = estado.bateria;

  return (
    <div className="ilha-cartao">
      <div className="ilha-cartao-corpo ilha-sistema">
        <div className="ilha-sistema-topo">
          {b && (
            <div className="ilha-sistema-bateria" data-baixa={b.nivel <= 15 && !b.carregando ? "sim" : "nao"}>
              <IconeBateria nivel={b.nivel} carregando={b.carregando} />
              <div className="coluna" style={{ gap: 0 }}>
                <b className="numero">{b.nivel}%</b>
                <span className="ilha-mini">{b.carregando ? S.carregando : b.minutos ? S.restante(tempo(b.minutos)) : S.naBateria}</span>
              </div>
              <span className="ilha-sistema-barra"><span style={{ width: `${b.nivel}%` }} /></span>
            </div>
          )}
          {brilho !== null && (
            <label className="ilha-sistema-brilho">
              <Sun size={15} />
              <input type="range" min={0} max={100} step={5} value={brilho} aria-label={S.brilho} onChange={(e) => mudarBrilho(Number(e.target.value))} style={{ ["--p" as string]: `${brilho}%` }} />
              <span className="ilha-mini numero">{brilho}%</span>
            </label>
          )}
        </div>

        <div className="ilha-sistema-chaves">
          <button type="button" className="ilha-sistema-chave" aria-pressed={wifiLigado} disabled={ocupado === "wifi"} onClick={() => executar("wifi", () => sistema.radio("WiFi", !wifiLigado))}>
            {wifiLigado ? <Wifi size={15} /> : <WifiOff size={15} />}
            <span className="coluna" style={{ gap: 0, minWidth: 0 }}>
              <b>{S.wifi}</b>
              <span className="cortar">{!wifiLigado ? S.desligado : estado.wifi.conectado ? estado.wifi.ssid : S.semRede}</span>
            </span>
          </button>
          <button type="button" className="ilha-sistema-chave" aria-pressed={btLigado} disabled={ocupado === "bt"} onClick={() => executar("bt", () => sistema.radio("Bluetooth", !btLigado))}>
            {btLigado ? <Bluetooth size={15} /> : <BluetoothOff size={15} />}
            <span className="coluna" style={{ gap: 0, minWidth: 0 }}>
              <b>{S.bluetooth}</b>
              <span className="cortar">{btLigado ? S.ligado : S.desligado}</span>
            </span>
          </button>
        </div>

        <div className="linha-entre">
          <div className="ilha-sistema-abas" role="tablist">
            <button type="button" role="tab" aria-selected={lista === "redes"} onClick={() => setLista("redes")}>{S.redes}</button>
            <button type="button" role="tab" aria-selected={lista === "bluetooth"} onClick={() => setLista("bluetooth")}>{S.aparelhos}</button>
          </div>
          <span className="linha" style={{ gap: 4 }}>
            <button type="button" className="ilha-acao" aria-label={S.atualizar} title={S.atualizar} onClick={() => (lista === "redes" ? lerRedes() : lerBluetooth())}><RefreshCw size={13} /></button>
            <button type="button" className="ilha-acao" aria-label={S.abrirWindows} title={S.abrirWindows} onClick={() => void sistema.configuracoes(lista === "redes" ? "wifi" : "bluetooth")}><ExternalLink size={13} /></button>
          </span>
        </div>

        <div className="ilha-rolagem ilha-sistema-lista">
          {lista === "redes" ? (
            !wifiLigado ? (
              <span className="ilha-sub">{S.wifiDesligado}</span>
            ) : redes.length === 0 ? (
              <span className="ilha-sub">{S.semRedes}</span>
            ) : (
              redes.map((r) => {
                const atual = estado.wifi.conectado && estado.wifi.ssid === r.ssid;
                const pedindo = senhaPara === r.ssid;
                return (
                  <div key={r.ssid} className="ilha-rede" data-atual={atual ? "sim" : "nao"}>
                    <div className="ilha-linha" style={{ minHeight: 30 }}>
                      <IconeSinal sinal={r.sinal} />
                      <span className="cortar" style={{ flex: 1 }}>{r.ssid}</span>
                      {r.segura && <Lock size={11} className="ilha-mini" />}
                      {atual ? (
                        <>
                          <span className="ilha-rede-conectada"><Check size={11} />{S.conectada}</span>
                          <button type="button" className="ilha-botao-texto" disabled={!!ocupado} onClick={() => executar("desc", () => sistema.desconectar())}>{S.desconectar}</button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="ilha-botao-texto"
                          disabled={ocupado === `rede-${r.ssid}`}
                          onClick={() => (r.segura && !r.salva ? setSenhaPara(pedindo ? null : r.ssid) : void conectar(r))}
                        >
                          {ocupado === `rede-${r.ssid}` ? S.conectando : S.conectar}
                        </button>
                      )}
                    </div>
                    {pedindo && (
                      <form
                        className="ilha-rede-senha"
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (senha.length < 8) return setErro(S.senhaCurta);
                          void conectar(r, senha);
                        }}
                      >
                        <input type="password" autoFocus autoComplete="off" value={senha} maxLength={63} placeholder={S.senha} aria-label={S.senha} onChange={(e) => setSenha(e.target.value)} />
                        <button type="submit" className="ilha-botao-texto" disabled={!!ocupado}>{S.conectar}</button>
                        <button type="button" className="ilha-acao" aria-label={T.geral.cancelar} onClick={() => setSenhaPara(null)}><X size={12} /></button>
                      </form>
                    )}
                  </div>
                );
              })
            )
          ) : !btLigado ? (
            <span className="ilha-sub">{S.btDesligado}</span>
          ) : aparelhos.length === 0 ? (
            <span className="ilha-sub">{S.semAparelhos}</span>
          ) : (
            <>
              {aparelhos.map((a) => (
                <div key={a.id} className="ilha-linha" style={{ minHeight: 30 }}>
                  <Headphones size={14} />
                  <span className="cortar" style={{ flex: 1 }}>{a.nome}</span>
                  <span className="ilha-ponto" style={{ background: a.ativo ? "#22c55e" : "#4b4f57" }} />
                  <span className="ilha-mini">{a.ativo ? S.pareadoAtivo : S.pareado}</span>
                </div>
              ))}
              <span className="ilha-mini" style={{ padding: "4px 6px" }}>{S.btDica}</span>
            </>
          )}
        </div>
        {erro && <span className="ilha-sub" style={{ color: "#f87171" }}>{erro}</span>}
      </div>
    </div>
  );
}
