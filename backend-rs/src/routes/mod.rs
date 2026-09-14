pub mod admin;
pub mod apps;
pub mod health;
pub mod leaderboard;
pub mod matches;
pub mod messages;
pub mod notifications;
pub mod proofs;
pub mod storage;
pub mod support;
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
        .merge(leaderboard::router())
        .merge(admin::router())
        .merge(support::router())
}
