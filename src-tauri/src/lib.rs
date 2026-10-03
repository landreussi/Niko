use std::collections::hash_map::RandomState;
use std::collections::HashMap;
use std::hash::{BuildHasher, Hasher};
use std::process::{Child, Command};
use std::sync::atomic::{AtomicIsize, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use serde::Deserialize;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, RunEvent, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

mod barra_windows;
mod janela_frente;
mod miniaturas;

const PORTA: u16 = 47831;
const ALTURA_ILHA: f64 = 460.0;
const ALTURA_DOCK: f64 = 250.0;

#[derive(Deserialize, Clone, Copy)]
struct Retangulo {
    x: f64,
    y: f64,
    w: f64,
    h: f64,
}

struct Estado {
    areas: Mutex<HashMap<String, Vec<Retangulo>>>,
    token: String,
    ponte: Mutex<Option<Child>>,
}

fn gerar_token() -> String {
    let mut texto = String::new();
    for _ in 0..4 {
        let mut h = RandomState::new().build_hasher();
        h.write_u128(std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0));
        h.write_u32(std::process::id());
        texto.push_str(&format!("{:016x}", h.finish()));
    }
    texto
}

#[tauri::command]
fn area_interativa(janela: String, retangulos: Vec<Retangulo>, estado: tauri::State<Estado>) {
    if let Ok(mut areas) = estado.areas.lock() {
        areas.insert(janela, retangulos);
    }
}

#[tauri::command]
fn token_ponte(estado: tauri::State<Estado>) -> String {
    estado.token.clone()
}

#[tauri::command]
fn porta_ponte() -> u16 {
    PORTA
}

#[tauri::command]
fn mostrar_sistema(app: AppHandle) {
    mostrar(&app);
}

static ULTIMA_FRENTE: AtomicIsize = AtomicIsize::new(0);

fn registrar_frente(app: &AppHandle) {
    let frente = unsafe { windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow() }.0 as isize;
    if frente == 0 {
        return;
    }
    let sobreposta = ["ilha", "dock"].iter().any(|r| app.get_webview_window(r).and_then(|j| j.hwnd().ok()).map(|h| h.0 as isize == frente).unwrap_or(false));
    if !sobreposta {
        ULTIMA_FRENTE.store(frente, Ordering::Relaxed);
    }
}

#[tauri::command]
fn alternar_sistema(app: AppHandle) {
    if let Some(janela) = app.get_webview_window("sistema") {
        let visivel = janela.is_visible().unwrap_or(false) && !janela.is_minimized().unwrap_or(false);
        let focada = janela.hwnd().map(|h| h.0 as isize == ULTIMA_FRENTE.load(Ordering::Relaxed)).unwrap_or(false);
        if visivel && focada {
            let _ = janela.minimize();
        } else {
            mostrar(&app);
        }
    }
}

#[tauri::command]
fn abrir_link(url: String) -> Result<(), String> {
    let endereco = url.trim();
    if !(endereco.starts_with("https://") || endereco.starts_with("http://")) || endereco.chars().any(|c| c.is_whitespace() || c.is_control()) {
        return Err("link_invalido".into());
    }
    let largo: Vec<u16> = endereco.encode_utf16().chain(std::iter::once(0)).collect();
    let resultado = unsafe {
        windows::Win32::UI::Shell::ShellExecuteW(
            None,
            windows::core::w!("open"),
            windows::core::PCWSTR(largo.as_ptr()),
            None,
            None,
            windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL,
        )
    };
    if resultado.0 as isize > 32 {
        Ok(())
    } else {
        Err("falha_ao_abrir".into())
    }
}

#[tauri::command]
fn sair(app: AppHandle) {
    app.exit(0);
}

fn mostrar(app: &AppHandle) {
    if let Some(janela) = app.get_webview_window("sistema") {
        let _ = janela.unminimize();
        let _ = janela.show();
        let _ = janela.set_focus();
    }
}

fn criar_sobreposta(app: &AppHandle, rotulo: &str, y: f64, x: f64, largura: f64, altura: f64) -> tauri::Result<WebviewWindow> {
    WebviewWindowBuilder::new(app, rotulo, WebviewUrl::App("index.html".into()))
        .title("Niko")
        .transparent(true)
        .decorations(false)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .focused(false)
        .visible(false)
        .position(x, y)
        .inner_size(largura, altura)
        .build()
}

fn vigiar_cursor(app: AppHandle) {
    std::thread::spawn(move || {
        let mut fora: HashMap<String, bool> = HashMap::new();
        loop {
            std::thread::sleep(Duration::from_millis(45));
            registrar_frente(&app);
            let areas = match app.state::<Estado>().areas.lock() {
                Ok(a) => a.clone(),
                Err(_) => continue,
            };
            for rotulo in ["ilha", "dock"] {
                let Some(janela) = app.get_webview_window(rotulo) else { continue };
                let (Ok(cursor), Ok(origem), Ok(escala)) = (janela.cursor_position(), janela.outer_position(), janela.scale_factor()) else { continue };
                let x = (cursor.x - origem.x as f64) / escala;
                let y = (cursor.y - origem.y as f64) / escala;
                let dentro = areas.get(rotulo).map(|lista| lista.iter().any(|r| x >= r.x - 4.0 && x <= r.x + r.w + 4.0 && y >= r.y - 4.0 && y <= r.y + r.h + 4.0)).unwrap_or(false);
                let estava_fora = *fora.get(rotulo).unwrap_or(&false);
                let agora_fora = !dentro;
                if fora.get(rotulo).is_none() || estava_fora != agora_fora {
                    let _ = janela.set_ignore_cursor_events(agora_fora);
                    if agora_fora {
                        let _ = janela.emit_to(rotulo, "niko://cursor-fora", ());
                    }
                    fora.insert(rotulo.to_string(), agora_fora);
                }
            }
        }
    });
}

fn sem_prefixo(caminho: std::path::PathBuf) -> std::path::PathBuf {
    let texto = caminho.to_string_lossy().to_string();
    match texto.strip_prefix(r"\\?\UNC\") {
        Some(resto) => std::path::PathBuf::from(format!(r"\\{}", resto)),
        None => match texto.strip_prefix(r"\\?\") {
            Some(resto) => std::path::PathBuf::from(resto),
            None => caminho,
        },
    }
}

fn iniciar_ponte(app: &AppHandle, token: &str) {
    if cfg!(debug_assertions) {
        return;
    }
    let dados = app.path().app_data_dir().ok();
    let registrar = |texto: String| {
        if let Some(pasta) = &dados {
            let _ = std::fs::create_dir_all(pasta);
            let _ = std::fs::write(pasta.join("niko.log"), texto);
        }
    };
    let Ok(pasta) = app.path().resource_dir() else {
        registrar("sem pasta de recursos".into());
        return;
    };
    let recursos = sem_prefixo(pasta.join("recursos"));
    let node = recursos.join("node.exe");
    let script = recursos.join("ponte.mjs");
    let saida_erro = dados.as_ref().and_then(|p| std::fs::File::create(sem_prefixo(p.join("ponte.log"))).ok());
    let mut comando = Command::new(&node);
    comando.current_dir(&recursos).stdin(std::process::Stdio::null()).stdout(std::process::Stdio::null());
    match saida_erro {
        Some(arquivo) => {
            comando.stderr(arquivo);
        }
        None => {
            comando.stderr(std::process::Stdio::null());
        }
    }
    comando.arg("ponte.mjs").env("NIKO_PORTA", PORTA.to_string()).env("NIKO_TOKEN", token).env("NIKO_PAI", std::process::id().to_string());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        comando.creation_flags(0x0800_0000);
    }
    match comando.spawn() {
        Ok(filho) => {
            registrar(format!("ponte iniciada: {} {} (pid {})", node.display(), script.display(), filho.id()));
            if let Ok(mut ponte) = app.state::<Estado>().ponte.lock() {
                *ponte = Some(filho);
            }
        }
        Err(erro) => registrar(format!("falha ao iniciar a ponte: {} {} {}", node.display(), script.display(), erro)),
    }
}

fn parar_ponte(app: &AppHandle) {
    if let Ok(mut ponte) = app.state::<Estado>().ponte.lock() {
        if let Some(mut filho) = ponte.take() {
            let _ = filho.kill();
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let token = gerar_token();
    let escondido = std::env::args().any(|a| a == "--escondido");

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| mostrar(app)))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, Some(vec!["--escondido"])))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _atalho, evento| {
                    if evento.state() == ShortcutState::Pressed {
                        mostrar(app);
                        let _ = app.emit_to("sistema", "niko://captura", ());
                    }
                })
                .build(),
        )
        .manage(Estado { areas: Mutex::new(HashMap::new()), token: token.clone(), ponte: Mutex::new(None) })
        .manage(miniaturas::Miniaturas::default())
        .invoke_handler(tauri::generate_handler![
            area_interativa,
            token_ponte,
            porta_ponte,
            mostrar_sistema,
            alternar_sistema,
            abrir_link,
            sair,
            barra_windows::barra_windows,
            barra_windows::reservar_dock,
            janela_frente::frente_cobre_tela,
            miniaturas::miniaturas_janelas
        ])
        .setup(move |app| {
            let handle = app.handle().clone();
            barra_windows::restaurar(&handle);
            iniciar_ponte(&handle, &token);

            let monitor = app.primary_monitor()?.or(app.available_monitors()?.into_iter().next());
            let (mx, my, mw, mh, escala) = match &monitor {
                Some(m) => {
                    let escala = m.scale_factor();
                    let area = m.work_area();
                    (area.position.x as f64 / escala, area.position.y as f64 / escala, area.size.width as f64 / escala, area.size.height as f64 / escala, escala)
                }
                None => (0.0, 0.0, 1920.0, 1040.0, 1.0),
            };
            let _ = escala;

            let sistema = WebviewWindowBuilder::new(app, "sistema", WebviewUrl::App("index.html".into()))
                .title("Niko")
                .decorations(false)
                .inner_size(1320.0_f64.min(mw - 40.0), 860.0_f64.min(mh - 40.0))
                .min_inner_size(960.0, 600.0)
                .background_color(tauri::window::Color(14, 14, 16, 255))
                .center()
                .visible(!escondido)
                .build()?;
            let sistema_ref = sistema.clone();
            sistema.on_window_event(move |evento| {
                if let WindowEvent::CloseRequested { api, .. } = evento {
                    api.prevent_close();
                    let _ = sistema_ref.hide();
                }
            });

            criar_sobreposta(&handle, "ilha", my, mx, mw, ALTURA_ILHA)?;
            criar_sobreposta(&handle, "dock", my + mh - ALTURA_DOCK, mx, mw, ALTURA_DOCK)?;
            for rotulo in ["ilha", "dock"] {
                if let Some(j) = handle.get_webview_window(rotulo) {
                    let _ = j.set_ignore_cursor_events(true);
                }
            }
            vigiar_cursor(handle.clone());

            let abrir = MenuItem::with_id(app, "abrir", "Abrir o Niko", true, None::<&str>)?;
            let sair_item = MenuItem::with_id(app, "sair", "Sair", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&abrir, &sair_item])?;
            let mut bandeja = TrayIconBuilder::with_id("niko").menu(&menu).show_menu_on_left_click(false).tooltip("Niko");
            if let Some(icone) = app.default_window_icon() {
                bandeja = bandeja.icon(icone.clone());
            }
            bandeja
                .on_menu_event(|app, evento| match evento.id.as_ref() {
                    "abrir" => mostrar(app),
                    "sair" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|bandeja, evento| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = evento {
                        mostrar(bandeja.app_handle());
                    }
                })
                .build(app)?;

            let _ = app.global_shortcut().register("ctrl+alt+space");
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("falha ao iniciar o Niko");

    app.run(|handle, evento| {
        if let RunEvent::Exit = evento {
            barra_windows::reservar_espaco_do_dock(handle, false);
            barra_windows::restaurar(handle);
            parar_ponte(handle);
        }
    });
}
