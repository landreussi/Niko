use serde::Serialize;
use windows::Win32::Foundation::{HWND, POINT, RECT};
use windows::Win32::Graphics::Gdi::{GetMonitorInfoW, MonitorFromPoint, MonitorFromWindow, HMONITOR, MONITORINFO, MONITOR_DEFAULTTONEAREST, MONITOR_DEFAULTTOPRIMARY};
use windows::Win32::UI::Shell::{SHQueryUserNotificationState, QUNS_PRESENTATION_MODE, QUNS_RUNNING_D3D_FULL_SCREEN};
use windows::Win32::UI::WindowsAndMessaging::{GetClassNameW, GetForegroundWindow, GetWindowRect, GetWindowThreadProcessId, IsZoomed};

const CLASSES_DO_SHELL: [&str; 4] = ["Progman", "WorkerW", "Shell_TrayWnd", "Shell_SecondaryTrayWnd"];

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct EstadoDaFrente {
    cobre: bool,
    tela_cheia: bool,
}

fn windows_em_tela_cheia() -> bool {
    match unsafe { SHQueryUserNotificationState() } {
        Ok(estado) => estado == QUNS_RUNNING_D3D_FULL_SCREEN || estado == QUNS_PRESENTATION_MODE,
        Err(_) => false,
    }
}

unsafe fn retangulo_cobre_monitor(janela: HWND, monitor: HMONITOR) -> bool {
    let mut retangulo = RECT::default();
    if GetWindowRect(janela, &mut retangulo).is_err() {
        return false;
    }
    let mut info = MONITORINFO { cbSize: std::mem::size_of::<MONITORINFO>() as u32, ..Default::default() };
    if !GetMonitorInfoW(monitor, &mut info).as_bool() {
        return false;
    }
    let tela = info.rcMonitor;
    retangulo.left <= tela.left && retangulo.top <= tela.top && retangulo.right >= tela.right && retangulo.bottom >= tela.bottom
}

unsafe fn ler_janela_da_frente() -> EstadoDaFrente {
    let frente = GetForegroundWindow();
    if frente.is_invalid() {
        return EstadoDaFrente::default();
    }
    let mut pid = 0u32;
    GetWindowThreadProcessId(frente, Some(&mut pid));
    if pid == std::process::id() {
        return EstadoDaFrente::default();
    }
    let mut classe = [0u16; 64];
    let tamanho = GetClassNameW(frente, &mut classe).max(0) as usize;
    let nome = String::from_utf16_lossy(&classe[..tamanho]);
    if CLASSES_DO_SHELL.contains(&nome.as_str()) {
        return EstadoDaFrente::default();
    }
    let monitor = MonitorFromWindow(frente, MONITOR_DEFAULTTONEAREST);
    if monitor != MonitorFromPoint(POINT { x: 0, y: 0 }, MONITOR_DEFAULTTOPRIMARY) {
        return EstadoDaFrente::default();
    }
    let maximizada = IsZoomed(frente).as_bool();
    let cobre_monitor = retangulo_cobre_monitor(frente, monitor);
    EstadoDaFrente { cobre: maximizada || cobre_monitor, tela_cheia: !maximizada && cobre_monitor }
}

#[tauri::command]
pub fn frente_cobre_tela() -> EstadoDaFrente {
    let janela = unsafe { ler_janela_da_frente() };
    let tela_cheia = janela.tela_cheia || windows_em_tela_cheia();
    EstadoDaFrente { cobre: janela.cobre || tela_cheia, tela_cheia }
}
