import { useEffect } from "react";
import { ouvirClaudeCode, type EventoClaude } from "../../../ponte/claudeCode";
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

function reagir(e: EventoClaude) {
  const estado = useClaudeCode.getState();
  const sessao = estado.sessoes[e.sessao];
  const projeto = sessao?.projeto ?? "";
  const silencio = useConfig.getState().naoPerturbe;
  const ilha = useIlha.getState();
  switch (e.evento) {
    case "PermissionRequest":
      if (!e.pedidoId) return;
      garantirAba();
      estado.focar(e.sessao);
      void tocarSom("approval", "avisos");
      ilha.abrir("claude");
      return;
    case "Stop":
      garantirAba();
      if (silencio) return;
      estado.focar(e.sessao);
      void tocarSom("finish", "avisos");
      ilha.abrir("claude");
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
