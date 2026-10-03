import { create } from "zustand";
import { NATIVO } from "../desktop/desktop";
import { tocarSom } from "../ponte/sons";

type Fase = "nada" | "disponivel" | "baixando" | "instalando" | "erro";

interface EstadoAtualizacao {
  fase: Fase;
  versao: string;
  notas: string;
  progresso: number;
  erro: string;
  verificar: () => Promise<void>;
  instalar: () => Promise<void>;
  dispensar: () => void;
}

let pendente: { downloadAndInstall: (aoEvento?: (e: { event: string; data?: { contentLength?: number; chunkLength?: number } }) => void) => Promise<void> } | null = null;

export const useAtualizacao = create<EstadoAtualizacao>()((set, get) => ({
  fase: "nada",
  versao: "",
  notas: "",
  progresso: 0,
  erro: "",
  verificar: async () => {
    if (!NATIVO || get().fase === "baixando" || get().fase === "instalando") return;
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const atualizacao = await check();
      if (!atualizacao) return;
      pendente = atualizacao;
      if (get().fase !== "disponivel") void tocarSom("peek", "avisos");
      set({ fase: "disponivel", versao: atualizacao.version, notas: atualizacao.body ?? "", erro: "" });
    } catch {
      return;
    }
  },
  instalar: async () => {
    if (!pendente || get().fase === "baixando") return;
    set({ fase: "baixando", progresso: 0 });
    let total = 0;
    let baixado = 0;
    try {
      await pendente.downloadAndInstall((e) => {
        if (e.event === "Started") total = e.data?.contentLength ?? 0;
        if (e.event === "Progress") {
          baixado += e.data?.chunkLength ?? 0;
          set({ progresso: total > 0 ? Math.min(0.99, baixado / total) : 0.5 });
        }
        if (e.event === "Finished") set({ fase: "instalando", progresso: 1 });
      });
      void tocarSom("approve", "avisos");
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch (e) {
      set({ fase: "erro", erro: (e as Error).message ?? String(e) });
      void tocarSom("error", "avisos");
    }
  },
  dispensar: () => set({ fase: "nada" }),
}));
