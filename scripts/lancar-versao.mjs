import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const conf = JSON.parse(readFileSync(join(raiz, "src-tauri", "tauri.conf.json"), "utf8"));
const versao = conf.version;
const chave = process.env.TAURI_SIGNING_PRIVATE_KEY ?? join(homedir(), ".tauri", "niko-atualizacao.key");
if (!existsSync(chave) && !process.env.TAURI_SIGNING_PRIVATE_KEY) throw new Error(`Chave de atualização não encontrada em ${chave}`);
const notas = process.argv.slice(2).join(" ") || `Niko ${versao}`;

execSync("pnpm tauri build", {
  cwd: raiz,
  stdio: "inherit",
  env: { ...process.env, TAURI_SIGNING_PRIVATE_KEY: process.env.TAURI_SIGNING_PRIVATE_KEY ?? readFileSync(chave, "utf8"), TAURI_SIGNING_PRIVATE_KEY_PASSWORD: process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ?? "" },
});

const pasta = join(raiz, "src-tauri", "target", "release", "bundle", "nsis");
const instalador = `Niko_${versao}_x64-setup.exe`;
const assinatura = readFileSync(join(pasta, `${instalador}.sig`), "utf8").trim();
const manifesto = {
  version: versao,
  notes: notas,
  pub_date: new Date().toISOString(),
  platforms: {
    "windows-x86_64": { signature: assinatura, url: `https://github.com/vitorcgo/niko/releases/download/v${versao}/${instalador}` },
  },
};
writeFileSync(join(pasta, "latest.json"), JSON.stringify(manifesto, null, 2));
console.log(`\nPronto. Crie a release v${versao} em github.com/vitorcgo/niko e envie:\n  ${join(pasta, instalador)}\n  ${join(pasta, "latest.json")}`);