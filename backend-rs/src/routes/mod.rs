pub mod apps;
pub mod health;
pub mod matches;
pub mod messages;
pub mod notifications;
pub mod proofs;
pub mod storage;
pub mod users;

use axum::Router;
use crate::state::AppState;

pub fn app_router() -> Router<AppState> {
    Router::new()
        .merge(health::router())
        .merge(users::router())
        .merge(apps::router())
        .merge(matches::router())
        .merge(proofs::router())
        .merge(messages::router())
        .merge(notifications::router())
        .merge(storage::router())
}
