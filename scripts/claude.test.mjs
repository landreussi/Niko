import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { createServer as criarServidorHttp } from "node:http";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "vite";

const raizTemporaria = mkdtempSync(join(tmpdir(), "niko-claude-teste-"));
process.env.USERPROFILE = raizTemporaria;
process.env.HOME = raizTemporaria;
process.env.APPDATA = join(raizTemporaria, "AppData");
process.env.NIKO_PORTA = "47999";

const vite = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true } });
const claude = await vite.ssrLoadModule("/servidor/claude.ts");
const { useClaudeCode } = await vite.ssrLoadModule("/src/estado/claudeCode.ts");
const pastaClaude = join(raizTemporaria, ".claude");
const settings = join(pastaClaude, "settings.json");
const lerSettings = () => JSON.parse(readFileSync(settings, "utf8"));
const segredo = () => JSON.parse(readFileSync(join(process.env.APPDATA, "com.niko.desktop", "gancho-claude.json"), "utf8")).segredo;

let servidor;
let base;
before(async () => {
  servidor = criarServidorHttp((req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/ponte/claude/evento") return void claude.receberEventoDoGancho(req, res);
    if (url.pathname === "/ponte/claude/eventos") return void claude.ouvirEventos(req, res);
    res.statusCode = 404;
    res.end();
  });
  await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${servidor.address().port}`;
});
after(async () => {
  servidor.closeAllConnections?.();
  await new Promise((r) => servidor.close(r));
  await vite.close();
  rmSync(raizTemporaria, { recursive: true, force: true });
});

test("instala os ganchos num settings.json que ainda não existe", () => {
  rmSync(pastaClaude, { recursive: true, force: true });
  const r = claude.instalarGanchos({ confirmacao: "INSTALAR" });
  assert.equal(r.copia, null);
  const dados = lerSettings();
  for (const evento of claude.EVENTOS_INSTALADOS) {
    const gancho = dados.hooks[evento][0].hooks[0];
    assert.equal(gancho.type, "http");
    assert.equal(gancho.url, "http://127.0.0.1:47999/ponte/claude/evento");
    assert.equal(gancho.headers["x-niko-gancho"], segredo());
    assert.equal(gancho.timeout, evento === "PermissionRequest" ? 120 : 5);
  }
  assert.equal(claude.estadoDaInstalacao().instalado, true);
});

test("preserva o que já existia, faz cópia e não duplica ao reinstalar", () => {
  mkdirSync(pastaClaude, { recursive: true });
  const original = { model: "opus", permissions: { allow: ["Bash(npm test)"] }, hooks: { Stop: [{ hooks: [{ type: "command", command: "echo fim" }] }], PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "checar.sh" }] }] } };
  writeFileSync(settings, JSON.stringify(original, null, 2));
  const r1 = claude.instalarGanchos({ confirmacao: "INSTALAR" });
  claude.instalarGanchos({ confirmacao: "INSTALAR" });
  assert.ok(r1.copia && existsSync(r1.copia));
  const dados = lerSettings();
  assert.equal(dados.model, "opus");
  assert.deepEqual(dados.permissions, original.permissions);
  assert.equal(dados.hooks.Stop.length, 2);
  assert.equal(dados.hooks.Stop[0].hooks[0].command, "echo fim");
  assert.equal(dados.hooks.PreToolUse[0].matcher, "Bash");
  assert.equal(dados.hooks.PreToolUse.filter((g) => g.hooks.some((h) => h.type === "http")).length, 1);
});

test("remover tira só as entradas do Niko", () => {
  claude.removerGanchos({ confirmacao: "REMOVER" });
  const dados = lerSettings();
  assert.equal(dados.model, "opus");
  assert.deepEqual(Object.keys(dados.hooks).sort(), ["PreToolUse", "Stop"]);
  assert.equal(dados.hooks.Stop[0].hooks[0].command, "echo fim");
  assert.equal(claude.estadoDaInstalacao().instalado, false);
  assert.ok(readdirSync(pastaClaude).some((n) => n.endsWith(".bak")));
});

test("recusa mexer num settings.json inválido e não altera o arquivo", () => {
  writeFileSync(settings, "{ isso não é json");
  assert.throws(() => claude.instalarGanchos({ confirmacao: "INSTALAR" }), /settings_invalido/);
  assert.equal(readFileSync(settings, "utf8"), "{ isso não é json");
  assert.equal(claude.estadoDaInstalacao().invalido, true);
  rmSync(settings);
});

test("exige confirmação explícita", () => {
  assert.throws(() => claude.instalarGanchos({}), /confirmacao_invalida/);
  assert.throws(() => claude.removerGanchos({ confirmacao: "sim" }), /confirmacao_invalida/);
});

test("a prévia esconde o segredo", () => {
  const p = claude.previaDaInstalacao("instalar");
  assert.ok(!p.proposto.includes(segredo()));
  assert.ok(p.proposto.includes("••••••••"));
});

const enviar = (corpo, cabecalhos = {}) => fetch(`${base}/ponte/claude/evento`, { method: "POST", headers: { "content-type": "application/json", ...cabecalhos }, body: JSON.stringify(corpo) });

test("rejeita evento sem o segredo certo", async () => {
  assert.equal((await enviar({ hook_event_name: "Stop" })).status, 403);
  assert.equal((await enviar({ hook_event_name: "Stop" }, { "x-niko-gancho": "errado" })).status, 403);
});

test("sem a ilha ouvindo, o pedido de permissão volta vazio na hora", async () => {
  const r = await enviar({ hook_event_name: "PermissionRequest", session_id: "s1", tool_name: "Bash", tool_input: { command: "ls" } }, { "x-niko-gancho": segredo() });
  assert.equal(r.status, 200);
  assert.equal(await r.text(), "");
});

test("com a ilha ouvindo, Permitir devolve a decisão no formato documentado", async () => {
  const controle = new AbortController();
  const fluxo = await fetch(`${base}/ponte/claude/eventos`, { signal: controle.signal });
  const leitor = fluxo.body.getReader();
  const decodificador = new TextDecoder();
  let buffer = "";
  const proximoPedido = async () => {
    for (;;) {
      const linhas = buffer.split("\n");
      for (const l of linhas) {
        if (!l.trim()) continue;
        const e = JSON.parse(l);
        if (e.evento === "PermissionRequest" && e.pedidoId && e.sessao === "s2") return e;
      }
      const { value } = await leitor.read();
      buffer += decodificador.decode(value, { stream: true });
    }
  };
  const resposta = enviar({ hook_event_name: "PermissionRequest", session_id: "s2", cwd: "C:\\projetos\\niko", tool_name: "Bash", tool_input: { command: "npm test" } }, { "x-niko-gancho": segredo() });
  const pedido = await proximoPedido();
  assert.equal(pedido.dados.tool_input.command, "npm test");
  claude.decidirPedido({ pedidoId: pedido.pedidoId, decisao: "allow" });
  const r = await resposta;
  assert.deepEqual(await r.json(), { hookSpecificOutput: { hookEventName: "PermissionRequest", decision: { behavior: "allow" } } });
  assert.throws(() => claude.decidirPedido({ pedidoId: pedido.pedidoId, decisao: "deny" }), /pedido_expirou/);
  controle.abort();
});

test("descarta campos enormes e recorta textos longos", async () => {
  const r = await enviar({ hook_event_name: "PreToolUse", session_id: "s3", tool_name: "Read", tool_input: { file_path: "a.ts" }, tool_response: "x".repeat(50000), transcript_path: "C:\\segredo.jsonl", extra: "y".repeat(9000) }, { "x-niko-gancho": segredo() });
  assert.equal(r.status, 200);
  const controle = new AbortController();
  const fluxo = await fetch(`${base}/ponte/claude/eventos`, { signal: controle.signal });
  const leitor = fluxo.body.getReader();
  let texto = "";
  while (!texto.includes("NikoConectado")) texto += new TextDecoder().decode((await leitor.read()).value);
  controle.abort();
  const evento = texto.split("\n").filter(Boolean).map((l) => JSON.parse(l)).find((e) => e.sessao === "s3");
  assert.equal(evento.dados.tool_response, undefined);
  assert.equal(evento.dados.transcript_path, undefined);
  assert.ok(evento.dados.extra.length < 4100);
});

test("recusa hooks com formato inesperado em vez de apagar", () => {
  mkdirSync(pastaClaude, { recursive: true });
  writeFileSync(settings, JSON.stringify({ hooks: ["algo"] }));
  assert.throws(() => claude.instalarGanchos({ confirmacao: "INSTALAR" }), /settings_invalido/);
  assert.deepEqual(lerSettings(), { hooks: ["algo"] });
  writeFileSync(settings, "{}");
});

test("detecta conexão desatualizada quando o segredo não bate", () => {
  claude.instalarGanchos({ confirmacao: "INSTALAR" });
  const dados = lerSettings();
  dados.hooks.Stop[0].hooks[0].headers["x-niko-gancho"] = "outro";
  writeFileSync(settings, JSON.stringify(dados));
  const estado = claude.estadoDaInstalacao();
  assert.equal(estado.desatualizado, true);
  assert.equal(estado.instalado, false);
  claude.instalarGanchos({ confirmacao: "INSTALAR" });
  assert.equal(claude.estadoDaInstalacao().desatualizado, false);
  assert.ok(!readdirSync(pastaClaude).some((n) => n.endsWith(".niko-gravando")));
});

test("devolver ao terminal responde vazio para o Claude Code perguntar lá", async () => {
  const controle = new AbortController();
  const fluxo = await fetch(`${base}/ponte/claude/eventos`, { signal: controle.signal });
  const leitor = fluxo.body.getReader();
  let buffer = "";
  const resposta = enviar({ hook_event_name: "PermissionRequest", session_id: "s4", tool_name: "Bash", tool_input: { command: "npm run build" } }, { "x-niko-gancho": segredo() });
  let pedido;
  while (!pedido) {
    buffer += new TextDecoder().decode((await leitor.read()).value);
    pedido = buffer.split("\n").filter(Boolean).map((l) => JSON.parse(l)).find((e) => e.sessao === "s4" && e.pedidoId);
  }
  claude.decidirPedido({ pedidoId: pedido.pedidoId, decisao: "terminal" });
  const r = await resposta;
  assert.equal(r.status, 200);
  assert.equal(await r.text(), "");
  assert.throws(() => claude.decidirPedido({ pedidoId: "x", decisao: "talvez" }), /decisao_invalida/);
  controle.abort();
});

test("evento repetido numa reconexão não duplica a atividade", () => {
  const evento = { id: "evento-unico", recebidoEm: new Date().toISOString(), evento: "PreToolUse", sessao: "s5", cwd: "C:\\projetos\\app", dados: { tool_name: "Bash", tool_input: { command: "npm test" } } };
  useClaudeCode.getState().aplicar(evento);
  useClaudeCode.getState().aplicar(evento);
  const sessao = useClaudeCode.getState().sessoes.s5;
  assert.equal(sessao.passos.length, 1);
  assert.equal(sessao.ferramentasUsadas, 1);
  assert.equal(sessao.projeto, "app");
});
