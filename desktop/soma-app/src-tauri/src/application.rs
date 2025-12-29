use std::sync::Arc;

use tauri::{Manager, Wry};
use tauri_plugin_deep_link::DeepLinkExt;
use tracing::info;

use crate::{
    agent::AgentApi,
    bootstrap::{Bootstrapper, MainBootstrap},
    daemon::DaemonApi,
    handlers::{
        agent::AgentController, blobs::BlobsController, documents::DocumentsController,
        search::SearchController, spaces::SpacesController,
    },
    protocol::{BlobProtocol, ProtocolRegistrar},
    state::{ManagedState},
};

pub struct SomaAppBuilder {
    builder: tauri::Builder<Wry>,
    bootstrapper: Arc<dyn Bootstrapper>,
    protocol_registrars: Vec<Arc<dyn ProtocolRegistrar>>,
}

impl SomaAppBuilder {
    pub fn new() -> Self {
        let bootstrapper: Arc<dyn Bootstrapper> = Arc::new(MainBootstrap::new());

        let builder = tauri::Builder::default();

        #[cfg(desktop)]
        let builder = builder.plugin(tauri_plugin_single_instance::init(|_app, argv, _cwd| {
            info!("another instance attempted to start with args: {argv:?}");
        }));

        let builder = builder
            .plugin(
                tauri_plugin_log::Builder::new()
                    .level(tauri_plugin_log::log::LevelFilter::Trace)
                    .target(tauri_plugin_log::Target::new(
                        tauri_plugin_log::TargetKind::Stdout,
                    ))
                    .target(tauri_plugin_log::Target::new(
                        tauri_plugin_log::TargetKind::LogDir {
                            file_name: Some("logs".to_string()),
                        },
                    ))
                    .build(),
            )
            .plugin(tauri_plugin_store::Builder::new().build())
            .plugin(tauri_plugin_opener::init())
            .plugin(tauri_plugin_window_state::Builder::new().build())
            .plugin(tauri_plugin_deep_link::init())
            .plugin(tauri_plugin_dialog::init());

        Self {
            builder,
            bootstrapper,
            protocol_registrars: vec![Arc::new(BlobProtocol::new())],
        }
    }

    pub fn build(self) -> SomaApp {
        SomaApp {
            builder: self.builder,
            bootstrapper: self.bootstrapper,
            protocol_registrars: self.protocol_registrars,
        }
    }
}

pub struct SomaApp {
    builder: tauri::Builder<Wry>,
    bootstrapper: Arc<dyn Bootstrapper>,
    protocol_registrars: Vec<Arc<dyn ProtocolRegistrar>>,
}

impl SomaApp {
    pub fn run(self) -> tauri::Result<()> {
        let context = tauri::generate_context!();
        let mut builder = self.builder;
        for registrar in self.protocol_registrars {
            builder = registrar.attach(builder);
        }

        let bootstrapper = Arc::clone(&self.bootstrapper);

        builder
            .setup(move |app| {
                let handle = app.handle();

                let daemon = DaemonApi::from_app(&app.handle())?;
                let agent = AgentApi::from_app(&app.handle())?;
                let managed_state = ManagedState::new(daemon, agent);

                let documents_controller = DocumentsController::new(managed_state.clone());
                let spaces_controller = SpacesController::new(managed_state.clone());
                let blobs_controller = BlobsController::new(managed_state.clone());
                let agent_controller = AgentController::new(managed_state.clone());
                let search_controller = SearchController::new();

                app.manage(documents_controller);
                app.manage(spaces_controller);
                app.manage(blobs_controller);
                app.manage(agent_controller);
                app.manage(search_controller);

                bootstrapper.clone().init(&handle)?;

                if let Some(start_urls) = app.deep_link().get_current()? {
                    info!("app started from deep link: {start_urls:?}");
                }
                app.deep_link().on_open_url(|event| {
                    info!("received deep link URLs: {:?}", event.urls());
                });
                Ok(())
            })
            .invoke_handler(tauri::generate_handler![
                crate::commands::documents_upsert_draft,
                crate::commands::documents_queue_daemon_sync,
                crate::commands::documents_sync_published,
                crate::commands::blobs_stage,
                crate::commands::documents_get_draft,
                crate::commands::documents_ensure_page,
                crate::commands::documents_list_pages,
                crate::commands::documents_update_page_title,
                crate::commands::documents_set_page_parents,
                crate::commands::agent_chat_stream,
                crate::commands::agent_list_models,
                crate::commands::agent_rerank,
                crate::commands::agent_resolve_drift,
                crate::commands::search,
                crate::commands::spaces_list,
                crate::commands::spaces_list_members,
                crate::commands::spaces_create,
                crate::commands::spaces_get,
                crate::commands::spaces_update,
                crate::commands::spaces_delete
            ])
            .run(context)
    }
}

pub struct AppEntrypoint {
    builder: SomaAppBuilder,
}

impl AppEntrypoint {
    pub fn new() -> Self {
        Self {
            builder: SomaAppBuilder::new(),
        }
    }

    pub fn run(self) -> tauri::Result<()> {
        self.builder.build().run()
    }
}
