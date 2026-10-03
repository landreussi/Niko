import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";

const SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$metodoOp = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -like 'IAsyncOperation*' })[0]
function Esperar($tarefa, $tipo) {
  $t = $metodoOp.MakeGenericMethod($tipo).Invoke($null, @($tarefa))
  $t.Wait(-1) | Out-Null
  $t.Result
}
[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime] | Out-Null
[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.Streams.IInputStream, Windows.Storage.Streams, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.Streams.IContentTypeProvider, Windows.Storage.Streams, ContentType = WindowsRuntime] | Out-Null
$gerente = Esperar ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
$ultimaCapa = ''
$capaAtual = $null
$capaTrocadaEm = [DateTime]::MinValue
$metodoParaFluxo = [System.IO.WindowsRuntimeStreamExtensions].GetMethod('AsStreamForRead', [type[]]@([Windows.Storage.Streams.IInputStream]))
$propriedadeTipo = [Windows.Storage.Streams.IContentTypeProvider].GetProperty('ContentType')

function Capa($props) {
  try {
    if (-not $props.Thumbnail) { return $null }
    $fluxo = Esperar ($props.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
    $net = $metodoParaFluxo.Invoke($null, @($fluxo))
    $mem = New-Object System.IO.MemoryStream
    $net.CopyTo($mem)
    $net.Dispose()
    if ($mem.Length -eq 0 -or $mem.Length -gt 2000000) { return $null }
    $tipo = [string]$propriedadeTipo.GetValue($fluxo)
    if (-not $tipo.StartsWith('image/')) { $tipo = 'image/jpeg' }
    return 'data:' + $tipo + ';base64,' + [Convert]::ToBase64String($mem.ToArray())
  } catch { return $null }
}

function Estado {
  $s = $gerente.GetCurrentSession()
  if (-not $s) { return @{ sessao = $false } }
  $props = Esperar ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
  $info = $s.GetPlaybackInfo()
  $linha = $s.GetTimelineProperties()
  $chaveCapa = [string]$s.SourceAppUserModelId + '|' + [string]$props.Title + '|' + [string]$props.Artist
  if ($chaveCapa -ne $script:ultimaCapa) {
    $script:ultimaCapa = $chaveCapa
    $script:capaTrocadaEm = [DateTime]::Now
    $script:capaAtual = Capa $props
  } elseif (-not $script:capaAtual -or ([DateTime]::Now - $script:capaTrocadaEm).TotalSeconds -lt 4) {
    $script:capaAtual = Capa $props
  }
  return @{
    sessao = $true
    app = [string]$s.SourceAppUserModelId
    titulo = [string]$props.Title
    artista = [string]$props.Artist
    album = [string]$props.AlbumTitle
    tocando = ([string]$info.PlaybackStatus -eq 'Playing')
    posicao = [math]::Round($linha.Position.TotalSeconds, 1)
    duracao = [math]::Round(($linha.EndTime - $linha.StartTime).TotalSeconds, 1)
    atualizadoEm = $linha.LastUpdatedTime.ToUnixTimeMilliseconds()
    podeAvancar = [bool]$info.Controls.IsNextEnabled
    podeVoltar = [bool]$info.Controls.IsPreviousEnabled
    podeBuscar = [bool]$info.Controls.IsPlaybackPositionEnabled
    capa = $script:capaAtual
  }
}

while ($true) {
  $linha = [Console]::In.ReadLine()
  if ($null -eq $linha) { break }
  try {
    $pedido = $linha | ConvertFrom-Json
    $s = $gerente.GetCurrentSession()
    switch ($pedido.acao) {
      'alternar' { if ($s) { Esperar ($s.TryTogglePlayPauseAsync()) ([bool]) | Out-Null } }
      'proxima' { if ($s) { Esperar ($s.TrySkipNextAsync()) ([bool]) | Out-Null } }
      'anterior' { if ($s) { Esperar ($s.TrySkipPreviousAsync()) ([bool]) | Out-Null } }
      'posicao' { if ($s) { Esperar ($s.TryChangePlaybackPositionAsync([long]([double]$pedido.segundos * 10000000))) ([bool]) | Out-Null } }
    }
    if ($pedido.acao -ne 'estado') { Start-Sleep -Milliseconds 250 }
    $r = Estado
    $r.id = $pedido.id
    [Console]::Out.WriteLine(($r | ConvertTo-Json -Compress -Depth 3))
  } catch {
    [Console]::Out.WriteLine((@{ id = $pedido.id; erro = $_.Exception.Message } | ConvertTo-Json -Compress))
  }
}
`;

const ARQUIVO = join(tmpdir(), "niko-midia-v2.ps1");
let processo: ChildProcessWithoutNullStreams | null = null;
let contador = 0;
const esperando = new Map<number, { resolver: (v: unknown) => void; rejeitar: (e: Error) => void; relogio: NodeJS.Timeout }>();

function iniciar() {
  if (processo) return processo;
  if (process.platform !== "win32") throw new Error("somente_windows");
  if (!existsSync(ARQUIVO)) writeFileSync(ARQUIVO, SCRIPT, "utf8");
  const p = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", ARQUIVO], { windowsHide: true });
  const leitor = createInterface({ input: p.stdout });
  leitor.on("line", (linha) => {
    try {
      const r = JSON.parse(linha) as { id?: number; erro?: string };
      const pendente = r.id ? esperando.get(r.id) : undefined;
      if (!pendente) return;
      esperando.delete(r.id!);
      clearTimeout(pendente.relogio);
      if (r.erro) pendente.rejeitar(new Error(r.erro));
      else pendente.resolver(r);
    } catch {
      return;
    }
  });
  p.on("exit", () => {
    processo = null;
    for (const [id, e] of esperando) {
      clearTimeout(e.relogio);
      e.rejeitar(new Error("midia_encerrada"));
      esperando.delete(id);
    }
  });
  processo = p;
  return p;
}

export function pedirMidia(acao: "estado" | "alternar" | "proxima" | "anterior" | "posicao", segundos?: number): Promise<unknown> {
  const p = iniciar();
  const id = ++contador;
  return new Promise((resolver, rejeitar) => {
    const relogio = setTimeout(() => {
      esperando.delete(id);
      rejeitar(new Error("tempo_esgotado"));
    }, 15000);
    esperando.set(id, { resolver, rejeitar, relogio });
    p.stdin.write(`${JSON.stringify({ id, acao, segundos: Number(segundos) || 0 })}\n`);
  });
}

export function encerrarMidia() {
  processo?.kill();
  processo = null;
}
