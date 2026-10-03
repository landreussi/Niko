import {
  siStripe, siGithub, siVercel, siResend, siNotion, siCaldotcom, siN8n, siAnthropic, siOllama,
  siNvidia, siOpencode, siQwen, siGooglegemini, siOpenrouter, siMistralai, siHuggingface, siDeepseek, siLmstudio, siGmail, siSupabase, siCloudflare,
} from "simple-icons";
import type { ServicoId } from "../tipos";

interface IconeMarca {
  title: string;
  path: string;
  hex: string;
}

export type MarcaId = ServicoId | "anthropic" | "ollama" | "nvidia" | "opencode" | "qwen" | "gemini" | "openrouter" | "mistral" | "huggingface" | "deepseek" | "lmstudio";

export const MARCAS: Record<MarcaId, IconeMarca> = {
  stripe: siStripe,
  github: siGithub,
  vercel: siVercel,
  resend: siResend,
  notion: siNotion,
  calcom: siCaldotcom,
  n8n: siN8n,
  gmail: siGmail,
  supabase: siSupabase,
  cloudflare: siCloudflare,
  anthropic: siAnthropic,
  ollama: siOllama,
  nvidia: siNvidia,
  opencode: siOpencode,
  qwen: siQwen,
  gemini: siGooglegemini,
  openrouter: siOpenrouter,
  mistral: siMistralai,
  huggingface: siHuggingface,
  deepseek: siDeepseek,
  lmstudio: siLmstudio,
};

function escura(hex: string): boolean {
  const n = parseInt(hex, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.22;
}

interface Props {
  marca: MarcaId;
  tamanho?: number;
  monocromatica?: boolean;
}

export function Marca({ marca, tamanho = 18, monocromatica = false }: Props) {
  const icone = MARCAS[marca];
  const cor = monocromatica || escura(icone.hex) ? "currentColor" : `#${icone.hex}`;
  return (
    <svg role="img" aria-label={icone.title} viewBox="0 0 24 24" width={tamanho} height={tamanho} fill={cor} style={{ flex: "0 0 auto" }}>
      <path d={icone.path} />
    </svg>
  );
}
