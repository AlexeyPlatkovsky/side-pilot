//! Multi-provider route planning and app-owned transcript replay (SP-016).
//!
//! This module is the Rust-core half of the AI switcher (SP-015). It decides
//! which adapters a prompt targets, computes the per-provider **diff** (the
//! messages a provider has not yet seen), composes that diff into a single
//! transcript with prior responses from *other* providers labeled
//! `[ProviderName]: …`, dispatches single-provider and `All` routes (the latter
//! concurrently), and records `message_provider_sends` rows so each provider
//! only ever receives new context.
//!
//! Native per-tool session ids may still be captured as a per-tool optimization,
//! but they are not the source of truth for multi-provider context — app-owned
//! transcript replay is (`docs/idea.md` §6).

use futures::future::join_all;
use serde::{Deserialize, Serialize};
use tokio_util::sync::CancellationToken;
use ts_rs::TS;

use crate::adapters::contract::DEFAULT_TIMEOUT_MS;
use crate::adapters::{
    AdapterError, AdapterRegistry, AdapterRequest, AssistantId, PermissionMode,
};
use crate::storage::{Message, NewMessage, Sender, StorageError, Store};

/// Which provider(s) a prompt is routed to.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "kind", rename_all = "camelCase")]
#[ts(export, export_to = "../../src/chat/generated/")]
pub enum Route {
    /// Route to exactly one provider.
    Single { provider: AssistantId },
    /// Route concurrently to every active provider.
    All,
}

/// A request to route one prompt through the planner.
#[derive(Debug, Clone, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/chat/generated/")]
pub struct RouteRequest {
    pub session_id: String,
    pub route: Route,
    pub prompt: String,
    /// Providers considered active for an `All` route, in display order.
    #[serde(default)]
    pub active_providers: Vec<AssistantId>,
    /// Optional model override applied to each fresh adapter request.
    #[serde(default)]
    #[ts(optional)]
    pub model: Option<String>,
    /// Per-provider timeout in milliseconds (SP-009 contract).
    #[serde(default = "default_timeout_ms")]
    #[ts(type = "number")]
    pub timeout_ms: u64,
}

fn default_timeout_ms() -> u64 {
    DEFAULT_TIMEOUT_MS
}

/// The outcome of one provider's slot in a route run.
#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/chat/generated/")]
pub struct ProviderRunOutcome {
    pub provider: AssistantId,
    /// The persisted assistant history row: a reply on success or a
    /// display-only inline error card on failure.
    #[ts(optional)]
    pub message: Option<Message>,
    /// The typed adapter error on failure (the slot failed; siblings are
    /// unaffected).
    #[ts(optional)]
    pub error: Option<AdapterError>,
}

/// The result of a whole route run: the persisted user prompt plus one outcome
/// per targeted provider, in target order.
#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/chat/generated/")]
pub struct RouteRunResult {
    pub user_message: Message,
    pub outcomes: Vec<ProviderRunOutcome>,
}

/// Resolve a route to its ordered, de-duplicated list of target providers.
pub fn plan_targets(route: &Route, active: &[AssistantId]) -> Vec<AssistantId> {
    match route {
        Route::Single { provider } => vec![*provider],
        Route::All => {
            let mut targets: Vec<AssistantId> = Vec::with_capacity(active.len());
            for provider in active {
                if !targets.contains(provider) {
                    targets.push(*provider);
                }
            }
            targets
        }
    }
}

/// Compose a provider's diff into a single replayable transcript. User turns are
/// rendered verbatim; assistant turns are labeled with the producing provider
/// (`[ProviderName]: …`) so cross-provider context is unambiguous (§6).
pub fn compose_prompt(messages: &[Message]) -> String {
    messages
        .iter()
        .map(format_turn)
        .collect::<Vec<_>>()
        .join("\n\n")
}

fn format_turn(message: &Message) -> String {
    match message.sender {
        Sender::User => message.content.clone(),
        Sender::Assistant => {
            let label = message
                .assistant_id
                .as_deref()
                .and_then(|id| id.parse::<AssistantId>().ok())
                .map(AssistantId::display_name)
                .unwrap_or("Assistant");
            format!("[{label}]: {content}", content = message.content)
        }
    }
}

fn provider_error_message(provider: AssistantId, error: &AdapterError) -> String {
    let name = match provider {
        AssistantId::Codex => "GPT",
        AssistantId::Claude => "Claude",
        AssistantId::Gemini => "Gemini",
    };
    match error {
        AdapterError::BinaryNotFound => {
            format!("{name} isn't available — its CLI wasn't found on your PATH.")
        }
        AdapterError::NotAuthenticated => {
            format!("{name} is not authenticated. Sign in to its CLI and try again.")
        }
        AdapterError::TimedOut => format!("{name} timed out before responding."),
        AdapterError::Cancelled => format!("The {name} request was cancelled."),
        AdapterError::NonZeroExit { stderr, .. } => {
            if stderr.is_empty() {
                format!("{name} exited with an error.")
            } else {
                format!("{name} exited with an error: {stderr}.")
            }
        }
        AdapterError::OutputParseFailure { .. } => {
            format!("{name} returned output that could not be read.")
        }
    }
}

/// Everything needed to dispatch one provider's slot, snapshotted from a
/// consistent pre-send state so concurrent `All` runs do not race the store.
struct Prepared {
    provider: AssistantId,
    diff_ids: Vec<String>,
    request: AdapterRequest,
    cancel: CancellationToken,
}

/// Run a route end to end: persist the prompt, compute each provider's diff,
/// dispatch (concurrently for `All`), persist successes, and record sends.
///
/// Adapter failures are returned per slot inside [`ProviderRunOutcome`] — a
/// failing provider never cancels its siblings and never records a send. The
/// outer `Result` error is reserved for storage failures (e.g. the session does
/// not exist).
pub async fn execute_route(
    store: &Store,
    registry: &AdapterRegistry,
    request: RouteRequest,
    mut make_cancel: impl FnMut(AssistantId) -> CancellationToken,
) -> Result<RouteRunResult, StorageError> {
    // 1. Persist the user's prompt as the next message in the session.
    let user_message = store.append_message(NewMessage {
        session_id: request.session_id.clone(),
        sender: Sender::User,
        assistant_id: None,
        content: request.prompt.clone(),
        raw_json: None,
    })?;

    // 2. Resolve target providers for this route.
    let targets = plan_targets(&request.route, &request.active_providers);

    // 3. Snapshot each provider's diff and build its request BEFORE any dispatch
    //    so concurrent runs observe a consistent pre-send transcript.
    let mut prepared: Vec<Prepared> = Vec::with_capacity(targets.len());
    for provider in targets {
        let diff = store.unsent_messages(&request.session_id, provider.as_str())?;
        let diff_ids = diff.iter().map(|m| m.id.clone()).collect();
        let prompt = compose_prompt(&diff);
        prepared.push(Prepared {
            provider,
            diff_ids,
            request: AdapterRequest {
                assistant: provider,
                prompt,
                working_directory: None,
                model: request.model.clone(),
                reasoning_effort: None,
                permission_mode: PermissionMode::ReadOnly,
                timeout_ms: request.timeout_ms,
                resume_session_id: None,
                run_id: None,
            },
            cancel: make_cancel(provider),
        });
    }

    // 4. Dispatch concurrently. `join_all` polls every future together, so a
    //    partial failure resolves independently without cancelling the others.
    let results = join_all(prepared.iter().map(|p| {
        let request = p.request.clone();
        let cancel = p.cancel.clone();
        async move { registry.run(request, cancel).await }
    }))
    .await;

    // 5. Persist successful responses and record sends; collect outcomes in
    //    target order. Store work happens after the concurrent await, so no lock
    //    is held across `.await`.
    let mut outcomes = Vec::with_capacity(prepared.len());
    for (prep, result) in prepared.into_iter().zip(results) {
        match result {
            Ok(adapter_result) => {
                let message = store.append_message(NewMessage {
                    session_id: request.session_id.clone(),
                    sender: Sender::Assistant,
                    assistant_id: Some(prep.provider.as_str().to_string()),
                    content: adapter_result.assistant_text,
                    raw_json: Some(adapter_result.raw_json),
                })?;
                // The provider has now seen its diff and its own answer, so
                // neither is replayed to it next turn.
                for id in &prep.diff_ids {
                    store.mark_message_sent(id, prep.provider.as_str())?;
                }
                store.mark_message_sent(&message.id, prep.provider.as_str())?;
                outcomes.push(ProviderRunOutcome {
                    provider: prep.provider,
                    message: Some(message),
                    error: None,
                });
            }
            Err(error) => {
                // Failed slots are display history, but never provider context:
                // the store excludes error rows from transcript replay while
                // leaving the original diff unsent so a retry re-delivers it.
                let message = store.append_error_message(NewMessage {
                    session_id: request.session_id.clone(),
                    sender: Sender::Assistant,
                    assistant_id: Some(prep.provider.as_str().to_string()),
                    content: provider_error_message(prep.provider, &error),
                    raw_json: serde_json::to_string(&error).ok(),
                })?;
                outcomes.push(ProviderRunOutcome {
                    provider: prep.provider,
                    message: Some(message),
                    error: Some(error),
                });
            }
        }
    }

    Ok(RouteRunResult {
        user_message,
        outcomes,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;

    use async_trait::async_trait;

    use crate::adapters::{AdapterResult, CliAdapter};

    // ---- Fixtures ------------------------------------------------------------

    fn msg(seq: i64, sender: Sender, assistant_id: Option<&str>, content: &str) -> Message {
        Message {
            id: format!("m{seq}"),
            session_id: "s1".to_string(),
            seq,
            sender,
            assistant_id: assistant_id.map(str::to_string),
            content: content.to_string(),
            raw_json: None,
            is_error: false,
            created_at: seq,
        }
    }

    /// Stub adapter that returns a canned result/error and records the prompt it
    /// received.
    struct StubAdapter {
        id: AssistantId,
        result: Result<AdapterResult, AdapterError>,
    }

    #[async_trait]
    impl CliAdapter for StubAdapter {
        fn id(&self) -> AssistantId {
            self.id
        }
        async fn run(
            &self,
            req: AdapterRequest,
            _cancel: CancellationToken,
        ) -> Result<AdapterResult, AdapterError> {
            // Echo the composed prompt back as the raw_json so tests can assert
            // what context the provider received.
            self.result.clone().map(|mut r| {
                r.raw_json = req.prompt;
                r
            })
        }
    }

    fn ok_result(text: &str) -> Result<AdapterResult, AdapterError> {
        Ok(AdapterResult {
            assistant_text: text.to_string(),
            raw_json: String::new(),
            native_session_id: None,
            usage: None,
        })
    }

    fn registry_with(
        adapters: Vec<(AssistantId, Result<AdapterResult, AdapterError>)>,
    ) -> AdapterRegistry {
        let mut registry = AdapterRegistry::new();
        for (id, result) in adapters {
            registry.register(Arc::new(StubAdapter { id, result }));
        }
        registry
    }

    fn no_cancel(_: AssistantId) -> CancellationToken {
        CancellationToken::new()
    }

    fn sends_count(store: &Store, message_id: &str, provider: &str) -> i64 {
        let conn = store_conn(store);
        conn.query_row(
            "SELECT COUNT(*) FROM message_provider_sends WHERE message_id = ?1 AND provider = ?2",
            rusqlite::params![message_id, provider],
            |row| row.get(0),
        )
        .unwrap()
    }

    // Test-only access to the store connection for assertions on the junction
    // table. Mirrors how the store's own tests reach in.
    fn store_conn(store: &Store) -> std::sync::MutexGuard<'_, rusqlite::Connection> {
        store.test_connection()
    }

    // ---- plan_targets --------------------------------------------------------

    #[test]
    fn single_route_targets_one_provider() {
        let targets = plan_targets(
            &Route::Single {
                provider: AssistantId::Codex,
            },
            &[AssistantId::Codex, AssistantId::Claude],
        );
        assert_eq!(targets, vec![AssistantId::Codex]);
    }

    #[test]
    fn all_route_targets_every_active_provider_in_order() {
        let targets = plan_targets(
            &Route::All,
            &[AssistantId::Codex, AssistantId::Claude, AssistantId::Gemini],
        );
        assert_eq!(
            targets,
            vec![AssistantId::Codex, AssistantId::Claude, AssistantId::Gemini]
        );
    }

    #[test]
    fn all_route_dedupes_repeated_providers() {
        let targets = plan_targets(
            &Route::All,
            &[AssistantId::Codex, AssistantId::Codex, AssistantId::Claude],
        );
        assert_eq!(targets, vec![AssistantId::Codex, AssistantId::Claude]);
    }

    // ---- compose_prompt ------------------------------------------------------

    #[test]
    fn compose_lone_user_prompt_is_verbatim() {
        let composed = compose_prompt(&[msg(1, Sender::User, None, "hello")]);
        assert_eq!(composed, "hello");
    }

    #[test]
    fn compose_labels_prior_responses_with_their_provider() {
        let composed = compose_prompt(&[
            msg(1, Sender::User, None, "first question"),
            msg(2, Sender::Assistant, Some("codex"), "codex answer"),
            msg(3, Sender::User, None, "follow up"),
        ]);
        assert_eq!(
            composed,
            "first question\n\n[Codex]: codex answer\n\nfollow up"
        );
    }

    #[test]
    fn compose_labels_unknown_assistant_generically() {
        let composed = compose_prompt(&[msg(1, Sender::Assistant, Some("mystery"), "x")]);
        assert_eq!(composed, "[Assistant]: x");
    }

    // ---- execute_route: Scenario 1 (first send, empty history) --------------

    #[tokio::test]
    async fn first_send_targets_provider_and_records_send() {
        let store = Store::in_memory().unwrap();
        let session = store.create_session(None).unwrap();
        let registry = registry_with(vec![(AssistantId::Codex, ok_result("pong"))]);

        let result = execute_route(
            &store,
            &registry,
            RouteRequest {
                session_id: session.id.clone(),
                route: Route::Single {
                    provider: AssistantId::Codex,
                },
                prompt: "ping".to_string(),
                active_providers: vec![],
                model: None,
                timeout_ms: 1000,
            },
            no_cancel,
        )
        .await
        .unwrap();

        assert_eq!(result.outcomes.len(), 1);
        let outcome = &result.outcomes[0];
        assert_eq!(outcome.provider, AssistantId::Codex);
        assert_eq!(
            outcome.message.as_ref().unwrap().content,
            "pong"
        );
        // The user prompt was sent to codex with no prior context.
        assert_eq!(result.user_message.content, "ping");
        assert_eq!(sends_count(&store, &result.user_message.id, "codex"), 1);
    }

    // ---- execute_route: Scenario 2 (switch provider, full diff + labels) ----

    #[tokio::test]
    async fn switching_provider_replays_labeled_prior_context() {
        let store = Store::in_memory().unwrap();
        let session = store.create_session(None).unwrap();

        // First turn to Codex.
        let codex_registry = registry_with(vec![(AssistantId::Codex, ok_result("codex says hi"))]);
        execute_route(
            &store,
            &codex_registry,
            RouteRequest {
                session_id: session.id.clone(),
                route: Route::Single {
                    provider: AssistantId::Codex,
                },
                prompt: "hello".to_string(),
                active_providers: vec![],
                model: None,
                timeout_ms: 1000,
            },
            no_cancel,
        )
        .await
        .unwrap();

        // Switch to Claude with a new prompt.
        let claude_registry =
            registry_with(vec![(AssistantId::Claude, ok_result("claude reply"))]);
        let result = execute_route(
            &store,
            &claude_registry,
            RouteRequest {
                session_id: session.id.clone(),
                route: Route::Single {
                    provider: AssistantId::Claude,
                },
                prompt: "and you?".to_string(),
                active_providers: vec![],
                model: None,
                timeout_ms: 1000,
            },
            no_cancel,
        )
        .await
        .unwrap();

        // Claude received the full prior transcript with Codex's turn labeled.
        let received = result.outcomes[0].message.as_ref().unwrap().raw_json.clone();
        assert_eq!(
            received.as_deref(),
            Some("hello\n\n[Codex]: codex says hi\n\nand you?")
        );
        // All three prior messages + nothing missing are now marked sent to claude.
        let history = store.read_history(&session.id).unwrap();
        // history: hello(user), codex says hi(assistant), and you?(user), claude reply(assistant)
        for m in &history[..3] {
            assert_eq!(sends_count(&store, &m.id, "claude"), 1, "msg {} sent to claude", m.seq);
        }
    }

    // ---- execute_route: Scenario 3 (same provider, only new message) --------

    #[tokio::test]
    async fn subsequent_same_provider_send_includes_only_new_message() {
        let store = Store::in_memory().unwrap();
        let session = store.create_session(None).unwrap();
        let make_registry = || registry_with(vec![(AssistantId::Claude, ok_result("ok"))]);

        for prompt in ["one", "two"] {
            execute_route(
                &store,
                &make_registry(),
                RouteRequest {
                    session_id: session.id.clone(),
                    route: Route::Single {
                        provider: AssistantId::Claude,
                    },
                    prompt: prompt.to_string(),
                    active_providers: vec![],
                    model: None,
                    timeout_ms: 1000,
                },
                no_cancel,
            )
            .await
            .unwrap();
        }

        // Third send to the same provider should only carry the new prompt.
        let result = execute_route(
            &store,
            &make_registry(),
            RouteRequest {
                session_id: session.id.clone(),
                route: Route::Single {
                    provider: AssistantId::Claude,
                },
                prompt: "three".to_string(),
                active_providers: vec![],
                model: None,
                timeout_ms: 1000,
            },
            no_cancel,
        )
        .await
        .unwrap();

        let received = result.outcomes[0].message.as_ref().unwrap().raw_json.clone();
        assert_eq!(received.as_deref(), Some("three"));
    }

    // ---- execute_route: Scenario 4 (All dispatches to all providers) --------

    #[tokio::test]
    async fn all_route_dispatches_to_every_active_provider() {
        let store = Store::in_memory().unwrap();
        let session = store.create_session(None).unwrap();
        let registry = registry_with(vec![
            (AssistantId::Codex, ok_result("c")),
            (AssistantId::Claude, ok_result("l")),
            (AssistantId::Gemini, ok_result("g")),
        ]);

        let result = execute_route(
            &store,
            &registry,
            RouteRequest {
                session_id: session.id.clone(),
                route: Route::All,
                prompt: "to all".to_string(),
                active_providers: vec![
                    AssistantId::Codex,
                    AssistantId::Claude,
                    AssistantId::Gemini,
                ],
                model: None,
                timeout_ms: 1000,
            },
            no_cancel,
        )
        .await
        .unwrap();

        let providers: Vec<AssistantId> =
            result.outcomes.iter().map(|o| o.provider).collect();
        assert_eq!(
            providers,
            vec![AssistantId::Codex, AssistantId::Claude, AssistantId::Gemini]
        );
        // Each got the same fresh prompt (no prior context yet).
        for outcome in &result.outcomes {
            assert_eq!(
                outcome.message.as_ref().unwrap().raw_json.as_deref(),
                Some("to all")
            );
        }
    }

    // ---- execute_route: Scenario 5 (partial failure isolation) --------------

    #[tokio::test]
    async fn partial_failure_in_all_mode_does_not_cancel_others() {
        let store = Store::in_memory().unwrap();
        let session = store.create_session(None).unwrap();
        let registry = registry_with(vec![
            (AssistantId::Codex, ok_result("c")),
            (AssistantId::Claude, ok_result("l")),
            (AssistantId::Gemini, Err(AdapterError::NonZeroExit {
                code: Some(1),
                stderr: "boom".to_string(),
            })),
        ]);

        let result = execute_route(
            &store,
            &registry,
            RouteRequest {
                session_id: session.id.clone(),
                route: Route::All,
                prompt: "to all".to_string(),
                active_providers: vec![
                    AssistantId::Codex,
                    AssistantId::Claude,
                    AssistantId::Gemini,
                ],
                model: None,
                timeout_ms: 1000,
            },
            no_cancel,
        )
        .await
        .unwrap();

        let gemini = result
            .outcomes
            .iter()
            .find(|o| o.provider == AssistantId::Gemini)
            .unwrap();
        assert!(gemini.message.as_ref().unwrap().is_error);
        assert!(gemini.error.is_some(), "gemini slot carries an error");

        // Codex and Claude still succeeded.
        for id in [AssistantId::Codex, AssistantId::Claude] {
            let o = result.outcomes.iter().find(|o| o.provider == id).unwrap();
            assert!(o.message.is_some());
            assert!(o.error.is_none());
        }

        // Sends recorded only for successful providers; the user prompt was not
        // marked sent to the failed gemini slot.
        assert_eq!(sends_count(&store, &result.user_message.id, "codex"), 1);
        assert_eq!(sends_count(&store, &result.user_message.id, "claude"), 1);
        assert_eq!(sends_count(&store, &result.user_message.id, "gemini"), 0);
    }

    #[tokio::test]
    async fn failed_slot_persists_display_history_but_is_not_replayed() {
        let store = Store::in_memory().unwrap();
        let session = store.create_session(None).unwrap();
        let registry = registry_with(vec![(
            AssistantId::Gemini,
            Err(AdapterError::NotAuthenticated),
        )]);

        execute_route(
            &store,
            &registry,
            RouteRequest {
                session_id: session.id.clone(),
                route: Route::Single {
                    provider: AssistantId::Gemini,
                },
                prompt: "first try".to_string(),
                active_providers: vec![],
                model: None,
                timeout_ms: 1000,
            },
            no_cancel,
        )
        .await
        .unwrap();

        let history = store.read_history(&session.id).unwrap();
        assert_eq!(history.len(), 2);
        assert_eq!(history[1].assistant_id.as_deref(), Some("gemini"));
        assert!(history[1].is_error);
        assert_eq!(
            history[1].content,
            "Gemini is not authenticated. Sign in to its CLI and try again."
        );

        let retry_registry = registry_with(vec![(AssistantId::Gemini, ok_result("recovered"))]);
        let result = execute_route(
            &store,
            &retry_registry,
            RouteRequest {
                session_id: session.id.clone(),
                route: Route::Single {
                    provider: AssistantId::Gemini,
                },
                prompt: "retry".to_string(),
                active_providers: vec![],
                model: None,
                timeout_ms: 1000,
            },
            no_cancel,
        )
        .await
        .unwrap();

        assert_eq!(
            result.outcomes[0].message.as_ref().unwrap().raw_json.as_deref(),
            Some("first try\n\nretry"),
            "the persisted error card must not be replayed to Gemini"
        );
    }

    // ---- execute_route: per-provider timeout carried from request ----------

    #[tokio::test]
    async fn timeout_for_one_slot_does_not_affect_others() {
        let store = Store::in_memory().unwrap();
        let session = store.create_session(None).unwrap();
        let registry = registry_with(vec![
            (AssistantId::Codex, ok_result("c")),
            (AssistantId::Claude, Err(AdapterError::TimedOut)),
        ]);

        let result = execute_route(
            &store,
            &registry,
            RouteRequest {
                session_id: session.id.clone(),
                route: Route::All,
                prompt: "hi".to_string(),
                active_providers: vec![AssistantId::Codex, AssistantId::Claude],
                model: None,
                timeout_ms: 1000,
            },
            no_cancel,
        )
        .await
        .unwrap();

        let codex = result
            .outcomes
            .iter()
            .find(|o| o.provider == AssistantId::Codex)
            .unwrap();
        let claude = result
            .outcomes
            .iter()
            .find(|o| o.provider == AssistantId::Claude)
            .unwrap();
        assert!(codex.message.is_some(), "codex unaffected by claude timeout");
        assert_eq!(claude.error, Some(AdapterError::TimedOut));
    }
}
