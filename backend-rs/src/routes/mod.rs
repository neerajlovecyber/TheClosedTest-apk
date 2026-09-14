pub mod apps;
pub mod health;
pub mod matches;
pub mod users;

use axum::Router;
use crate::state::AppState;

pub fn app_router() -> Router<AppState> {
    Router::new()
        .merge(health::router())
        .merge(users::router())
        .merge(apps::router())
        .merge(matches::router())
}
