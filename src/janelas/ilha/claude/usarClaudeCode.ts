import { useEffect } from "react";
import { claudeCode, ouvirClaudeCode, type EventoClaude } from "../../../ponte/claudeCode";
import { frenteEmTelaCheia } from "../../../desktop/desktop";
import { useClaudeCode } from "../../../estado/claudeCode";
import { useIlha } from "../../../estado/ilha";
import { useConfig } from "../../../estado/configuracoes";
import { tocarSom } from "../../../ponte/sons";
import { T } from "../../../textos/textos";

const TOLERANCIA_MS = 1500;

function garantirAba() {
  const cfg = useConfig.getState();
  if (!cfg.ilha.blocos.claude) cfg.definirIlha({ blocos: { ...cfg.ilha.blocos, claude: true } });
}

function devolverAoTerminal(pedidoId: string) {
  useClaudeCode.getState().removerPedido(pedidoId);
  void claudeCode.decidir(pedidoId, "terminal").catch(() => undefined);
}

function reagir(e: EventoClaude) {
  const estado = useClaudeCode.getState();
  const sessao = estado.sessoes[e.sessao];
  const projeto = sessao?.projeto ?? "";
  const silencio = useConfig.getState().naoPerturbe;
  const ilha = useIlha.getState();
  switch (e.evento) {
    case "PermissionRequest": {
      const pedidoId = e.pedidoId;
      if (!pedidoId) return;
      if (!useConfig.getState().ilha.ativa) {
        devolverAoTerminal(pedidoId);
        return;
      }
      void frenteEmTelaCheia().then((cheia) => {
        if (cheia) {
          devolverAoTerminal(pedidoId);
          return;
        }
        if (!useClaudeCode.getState().pedidos.some((p) => p.pedidoId === pedidoId)) return;
        garantirAba();
        useClaudeCode.getState().focar(e.sessao);
        void tocarSom("approval", "avisos");
        const ilhaAgora = useIlha.getState();
        if (ilhaAgora.estado === "escondida") ilhaAgora.definirEstado("compacta");
      });
      return;
    }
    case "Stop":
      garantirAba();
      if (silencio) return;
      estado.focar(e.sessao);
      void tocarSom("finish", "avisos");
      if (ilha.estado !== "expandida") ilha.revelar({ texto: T.ilha.claude.terminouAviso(projeto), tipo: "sucesso", marca: "claudecode", aba: "claude" }, 7000, "normal");
      return;
    case "StopFailure":
      garantirAba();
      void tocarSom("error", "avisos");
      ilha.revelar({ texto: T.ilha.claude.erroAviso(projeto), tipo: "alerta", marca: "claudecode", aba: "claude" }, 6000);
      return;
    case "Notification":
      if (sessao?.estado === "esperando") {
        void tocarSom("question", "avisos");
        ilha.revelar({ texto: T.ilha.claude.esperandoAviso(projeto), tipo: "info", marca: "claudecode", aba: "claude" }, 6000);
      } else if (sessao?.estado === "limite") {
        void tocarSom("rate", "avisos");
        ilha.revelar({ texto: T.ilha.claude.limiteAviso(projeto), tipo: "alerta", marca: "claudecode", aba: "claude" }, 6000);
      }
      return;
    case "SessionStart":
    case "UserPromptSubmit":
      garantirAba();
      return;
    default:
      return;
  }
}

export function usarClaudeCode() {
  useEffect(() => {
    let conectadoEm = Date.now();
    return ouvirClaudeCode(
      (e) => {
        useClaudeCode.getState().aplicar(e);
        if (Date.parse(e.recebidoEm) >= conectadoEm - TOLERANCIA_MS) reagir(e);
      },
      (ligado) => {
        if (ligado) conectadoEm = Date.now();
        useClaudeCode.getState().definirConectado(ligado);
      },
    );
  }, []);
}
