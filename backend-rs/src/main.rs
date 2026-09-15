use std::net::SocketAddr;
use tower_http::cors::{Any, CorsLayer};
use tower_http::request_id::{MakeRequestUuid, PropagateRequestIdLayer, SetRequestIdLayer};
use tower_http::trace::TraceLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use backend_rs::config::Config;
use backend_rs::db;
use backend_rs::routes;
use backend_rs::state::AppState;

use mimalloc::MiMalloc;

#[global_allocator]
static GLOBAL: MiMalloc = MiMalloc;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    dotenvy::dotenv().ok();

    // Explicitly install pure-Rust crypto provider for jsonwebtoken
    let _ = jsonwebtoken::crypto::CryptoProvider::install_default(
        &jsonwebtoken::crypto::rust_crypto::DEFAULT_PROVIDER,
    );

    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "backend_rs=debug,tower_http=info,axum=info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    let config = Config::from_env().map_err(|e| format!("Config error: {}", e))?;
    let port = config.port;

    tracing::info!("Initializing database connection pool...");
    let pool = db::init_pool(&config.database_url).await.map_err(|e| {
        tracing::error!("Failed to connect to database: {:?}", e);
        e
    })?;

    let state = AppState::new(pool, config);

    // Launch background worker for streaks and match reminders
    backend_rs::jobs::start_background_jobs(state.pool.clone(), state.http_client.clone());

    let x_request_id = axum::http::HeaderName::from_static("x-request-id");

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any)
        .expose_headers([x_request_id.clone()]);

    let app = routes::app_router()
        // 1. Defend against massive payloads (2 MB limit)
        .layer(axum::extract::DefaultBodyLimit::max(2 * 1024 * 1024))
        // 2. Cut off hanging requests after 30 seconds
        .layer(tower_http::timeout::TimeoutLayer::with_status_code(
            axum::http::StatusCode::REQUEST_TIMEOUT,
            std::time::Duration::from_secs(30),
        ))
        // 3. Redact Authorization Bearer headers from logs
        .layer(tower_http::sensitive_headers::SetSensitiveRequestHeadersLayer::new(std::iter::once(
            axum::http::header::AUTHORIZATION,
        )))
        // 4. Multi-engine compression: Brotli, Zstandard, and Gzip
        .layer(
            tower_http::compression::CompressionLayer::new()
                .gzip(true)
                .br(true)
                .zstd(true),
        )
        // 5. Sliding-window IP rate limiter
        .layer(axum::middleware::from_fn_with_state(
            state.clone(),
            backend_rs::middleware::rate_limit::rate_limiter_middleware,
        ))
        // 6. OWASP security headers (nosniff, DENY, strict-origin)
        .layer(axum::middleware::from_fn(
            backend_rs::middleware::security::security_headers_middleware,
        ))
        // 7. Propagate request ID into response headers
        .layer(PropagateRequestIdLayer::new(x_request_id.clone()))
        // 8. Structured request/response tracing tagged with request ID
        .layer(
            TraceLayer::new_for_http()
                .make_span_with(
                    tower_http::trace::DefaultMakeSpan::new()
                        .level(tracing::Level::INFO)
                        .include_headers(false),
                )
                .on_request(|request: &axum::http::Request<_>, _span: &tracing::Span| {
                    let req_id = request
                        .headers()
                        .get("x-request-id")
                        .and_then(|v| v.to_str().ok())
                        .unwrap_or("-");
                    tracing::info!("[req_id={}] --> {} {}", req_id, request.method(), request.uri().path());
                })
                .on_response(
                    |response: &axum::http::Response<_>, latency: std::time::Duration, _span: &tracing::Span| {
                        let req_id = response
                            .headers()
                            .get("x-request-id")
                            .and_then(|v| v.to_str().ok())
                            .unwrap_or("-");
                        let status = response.status();
                        let ms = latency.as_millis();
                        let reason = status.canonical_reason().unwrap_or("");
                        if status.is_server_error() {
                            tracing::error!("[req_id={}] <-- {} {} ({}ms)", req_id, status.as_u16(), reason, ms);
                        } else if status.is_client_error() {
                            tracing::warn!("[req_id={}] <-- {} {} ({}ms)", req_id, status.as_u16(), reason, ms);
                        } else {
                            tracing::info!("[req_id={}] <-- {} {} ({}ms)", req_id, status.as_u16(), reason, ms);
                        }
                    },
                )
                .on_failure(
                    |error: tower_http::classify::ServerErrorsFailureClass, latency: std::time::Duration, _span: &tracing::Span| {
                        tracing::error!("<-- SERVER ERROR: {:?} (after {}ms)", error, latency.as_millis());
                    },
                ),
        )
        // 8. Generate or attach x-request-id UUID header for incoming requests
        .layer(SetRequestIdLayer::new(x_request_id.clone(), MakeRequestUuid))
        // 9. CORS
        .layer(cors)
        .with_state(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    tracing::info!("🚀 High-Performance Rust backend listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    tracing::info!("🛑 Server shutdown gracefully. All connections closed.");
    Ok(())
}

async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("Failed to install Ctrl+C signal handler");
    };

    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("Failed to install SIGTERM signal handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {
            tracing::info!("Received Ctrl+C / SIGINT; initiating graceful shutdown...");
        },
        _ = terminate => {
            tracing::info!("Received SIGTERM; initiating graceful shutdown...");
        },
    }
}
