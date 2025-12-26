use std::sync::Arc;

use anyhow::Result;
use serde_json;
use tauri::{
    AppHandle, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindowBuilder,
    WindowEvent, Wry,
};
use tracing::info;

use crate::state::{AppSnapshot, AppStateStore, WindowBounds};

pub trait WindowController: Send + Sync {
    fn create_or_restore(self: Arc<Self>, app: &AppHandle<Wry>) -> Result<()>;
}

const DEFAULT_ROUTE: &str = "/spaces/private/pages/welcome";
const DEFAULT_WIDTH: f64 = 1200.0;
const DEFAULT_HEIGHT: f64 = 780.0;

pub struct MainWindowController<S: AppStateStore + ?Sized> {
    state_store: Arc<S>,
}

impl<S: AppStateStore + ?Sized> MainWindowController<S> {
    pub fn new(state_store: Arc<S>) -> Self {
        Self { state_store }
    }

    fn restore_or_default_bounds(snapshot: &AppSnapshot) -> WindowBounds {
        snapshot.window.clone().unwrap_or(WindowBounds {
            x: 0,
            y: 0,
            width: DEFAULT_WIDTH as u32,
            height: DEFAULT_HEIGHT as u32,
        })
    }

    fn resolve_route(snapshot: &AppSnapshot) -> String {
        let route = snapshot
            .last_route
            .clone()
            .unwrap_or_else(|| DEFAULT_ROUTE.to_string());
        if route.starts_with('/') {
            route
        } else {
            format!("/{}", route)
        }
    }

    fn persist_bounds_on_event(&self, window: &tauri::WebviewWindow<Wry>, event: &WindowEvent) {
        let app = window.app_handle();
        let position = |window: &tauri::WebviewWindow<Wry>| {
            window
                .outer_position()
                .unwrap_or_else(|_| PhysicalPosition::new(0, 0))
        };
        let size = |window: &tauri::WebviewWindow<Wry>| {
            window
                .outer_size()
                .unwrap_or_else(|_| PhysicalSize::new(DEFAULT_WIDTH as u32, DEFAULT_HEIGHT as u32))
        };

        match event {
            WindowEvent::Resized(resized) => {
                let pos = position(window);
                let bounds = WindowBounds {
                    x: pos.x,
                    y: pos.y,
                    width: resized.width,
                    height: resized.height,
                };
                let _ = self.state_store.persist_window(&app, bounds);
            }
            WindowEvent::Moved(moved) => {
                let size = size(window);
                let bounds = WindowBounds {
                    x: moved.x,
                    y: moved.y,
                    width: size.width,
                    height: size.height,
                };
                let _ = self.state_store.persist_window(&app, bounds);
            }
            WindowEvent::CloseRequested { .. } => {
                let pos = position(window);
                let size = size(window);
                let bounds = WindowBounds {
                    x: pos.x,
                    y: pos.y,
                    width: size.width,
                    height: size.height,
                };
                let _ = self.state_store.persist_window(&app, bounds);
            }
            _ => {}
        }
    }
}

impl<S: AppStateStore + ?Sized + 'static> WindowController for MainWindowController<S> {
    fn create_or_restore(self: Arc<Self>, app: &AppHandle<Wry>) -> Result<()> {
        if let Some(window) = app.get_webview_window("main") {
            window.show()?;
            window.set_focus()?;
            return Ok(());
        }

        let snapshot = self.state_store.load(app)?;
        let bounds = Self::restore_or_default_bounds(&snapshot);
        let route = Self::resolve_route(&snapshot);
        let url = format!("/index.html#{}", route.trim_start_matches('/'));

        let init_route =
            serde_json::to_string(&route).unwrap_or_else(|_| "\"/spaces/private\"".into());
        let builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::App(url.clone().into()))
            .inner_size(bounds.width as f64, bounds.height as f64)
            .position(bounds.x as f64, bounds.y as f64)
            .decorations(false)
            .title("soma-app")
            .initialization_script(&format!("window.__SOMA_INITIAL_ROUTE__ = {init_route};"))
            .visible(true);

        let window = builder.build()?;
        let controller = Arc::clone(&self);
        let event_window = window.clone();
        let event_window_for_hook = event_window.clone();
        event_window_for_hook.on_window_event(move |event| {
            controller.persist_bounds_on_event(&event_window, event);
        });

        info!("created main window with route {route}");
        Ok(())
    }
}
