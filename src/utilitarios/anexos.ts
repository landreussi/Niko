import type { AnexoMensagem } from "../tipos";

export const LIMITE_ARQUIVO = 8 * 1024 * 1024;
export const LIMITE_TEXTO = 30000;
export const MAXIMO_ANEXOS = 4;

const EXTENSOES_TEXTO = /\.(txt|md|markdown|csv|tsv|json|jsonc|xml|yaml|yml|toml|ini|env|log|html?|css|scss|less|js|jsx|ts|tsx|mjs|cjs|vue|svelte|py|rb|php|java|kt|kts|swift|c|h|cpp|hpp|cc|cs|go|rs|sql|sh|bash|ps1|bat|cmd|r|lua|dart|scala|gradle|dockerfile|gitignore)$/i;
const TIPOS_IMAGEM = /^image\/(png|jpeg|gif|webp)$/;

export interface AnexoPronto {
  anexo: AnexoMensagem;
  imagemCompleta?: { tipo: string; base64: string };
}

export type FalhaAnexo = "grande" | "tipo" | "leitura";

export function tipoDoAnexo(arquivo: File): "texto" | "imagem" | "outro" {
  if (TIPOS_IMAGEM.test(arquivo.type)) return "imagem";
  if (arquivo.type.startsWith("text/") || EXTENSOES_TEXTO.test(arquivo.name) || arquivo.type === "application/json") return "texto";
  return "outro";
}

function lerComo(arquivo: File, modo: "texto" | "url", aoProgresso: (p: number) => void): Promise<string> {
  return new Promise((resolver, rejeitar) => {
    const leitor = new FileReader();
    leitor.onprogress = (e) => e.lengthComputable && aoProgresso(e.loaded / e.total);
    leitor.onerror = () => rejeitar(new Error("leitura"));
    leitor.onload = () => resolver(String(leitor.result ?? ""));
    if (modo === "texto") leitor.readAsText(arquivo);
    else leitor.readAsDataURL(arquivo);
  });
}

function reduzirImagem(url: string, lado: number, qualidade: number): Promise<string> {
  return new Promise((resolver, rejeitar) => {
    const img = new Image();
    img.onload = () => {
      const escala = Math.min(1, lado / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * escala));
      canvas.height = Math.max(1, Math.round(img.height * escala));
      const ctx = canvas.getContext("2d");
      if (!ctx) return rejeitar(new Error("leitura"));
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolver(canvas.toDataURL("image/jpeg", qualidade));
    };
    img.onerror = () => rejeitar(new Error("leitura"));
    img.src = url;
  });
}

export async function lerAnexo(arquivo: File, aoProgresso: (p: number) => void): Promise<AnexoPronto> {
  if (arquivo.size > LIMITE_ARQUIVO) throw new Error("grande" satisfies FalhaAnexo);
  const tipo = tipoDoAnexo(arquivo);
  const base: AnexoMensagem = { nome: arquivo.name.slice(0, 120), tipo: arquivo.type || "application/octet-stream", tamanho: arquivo.size };
  if (tipo === "texto") {
    const conteudo = await lerComo(arquivo, "texto", aoProgresso);
    return { anexo: { ...base, texto: conteudo.slice(0, LIMITE_TEXTO) } };
  }
  if (tipo === "imagem") {
    const url = await lerComo(arquivo, "url", aoProgresso);
    const [miniatura, completa] = await Promise.all([reduzirImagem(url, 160, 0.7), reduzirImagem(url, 1568, 0.86)]);
    return { anexo: { ...base, imagem: miniatura }, imagemCompleta: { tipo: "image/jpeg", base64: completa.split(",")[1] ?? "" } };
  }
  throw new Error("tipo" satisfies FalhaAnexo);
}

const imagensPendentes = new Map<string, { tipo: string; base64: string }[]>();

export function guardarImagens(mensagemId: string, imagens: { tipo: string; base64: string }[]) {
  if (imagens.length) imagensPendentes.set(mensagemId, imagens);
}

export function imagensDaMensagem(mensagemId: string) {
  return imagensPendentes.get(mensagemId);
}

export function textoComAnexos(texto: string, anexos?: AnexoMensagem[]): string {
  if (!anexos?.length) return texto;
  const partes = anexos.map((a) => (a.texto != null ? `Arquivo anexado: ${a.nome}\n\`\`\`\n${a.texto}\n\`\`\`` : a.imagem ? `Imagem anexada: ${a.nome}` : `Arquivo anexado: ${a.nome}`));
  return `${texto}\n\n${partes.join("\n\n")}`.trim();
}

export function formatarTamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
