#[tokio::main]
async fn main() {
    notion_clone_api::bootstrap::server::run().await;
}
