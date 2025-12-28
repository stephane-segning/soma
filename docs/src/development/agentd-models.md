# Local LLMs with `soma-agentd` (GGUF models)

This page documents how to run `soma-agentd` with local GGUF models and how model choice affects chat behavior in `desktop/soma-app` (Tauri).

If you see “nonsense completions” (weather snippets, timestamps, role-play, or the model inventing `User:`/`System:` lines), it is almost always caused by **using a base model for chat** or a **missing/incorrect chat template**.

## What `soma-agentd` does

`soma-agentd` is the desktop, CPU-heavy helper process. One of its responsibilities is **local LLM inference** over a Unix domain socket (gRPC over UDS).

- Binary: `backend/bins/agentd` (`cargo run -p soma-agentd`)
- Config parsing: `backend/bins/agentd/src/config.rs`
- Inference engine: `backend/bins/agentd/src/engine.rs`

## Model directory and naming

`soma-agentd` needs a directory containing `.gguf` files (or symlinks):

- CLI: `--models-dir <dir>`
- Env: `SOMA_AGENTD_MODELS_DIR`

Example model directory (yours):

```bash
ls -lash "$HOME/dev/models"
```

Example contents:

- `Llama-3.2-3B.Q4_K_M.gguf` (base)
- `Meta-Llama-3-8B-Instruct.Q4_K_M.gguf` (instruct)
- `Qwen3VL-2B-Thinking-Q4_K_M.gguf` (chat/thinking)

### How `--default-chat-model` is resolved

`--default-chat-model` is a **UI-facing name**. In practice:

- If it ends with `.gguf`, the engine treats it like a file name:
  - absolute path → used directly
  - relative name → resolved as `<models-dir>/<name>`
- Otherwise it tries `<models-dir>/<sanitized>.gguf` and then a best-effort fuzzy match.

This is why the following works without needing a separate “registry”:

```bash
cargo run -p soma-agentd -- \
  --models-dir "$HOME/dev/models" \
  --default-chat-model Qwen3VL-2B-Thinking-Q4_K_M.gguf
```

## Base vs Instruct models (why Llama was “doing what it wants”)

### Base models

Base models (example: `Llama-3.2-3B.Q4_K_M.gguf`) are trained to **continue text**. In a chat UI they often:

- answer with completions unrelated to your prompt (e.g., “5° weather…”)
- continue the “transcript” by inventing additional turns (`User: ...`, `System: ...`)
- repeat boilerplate or latch onto common patterns

This is expected behavior: base models are not optimized for “follow the system prompt and respond like an assistant”.

### Instruct/chat models (recommended for chat)

Use an instruction-tuned model for chat:

- Example (already in your models folder):
  - `Meta-Llama-3-8B-Instruct.Q4_K_M.gguf`

Run:

```bash
cargo run -p soma-agentd -- \
  --models-dir "$HOME/dev/models" \
  --default-chat-model Meta-Llama-3-8B-Instruct.Q4_K_M.gguf
```

Why this helps:

- instruct models are trained on “prompt → helpful answer” formatting
- they usually embed a usable chat template (or at least behave more predictably with one)

## How `desktop/soma-app` chooses the model

UI now lists agentd chat models and lets you pick one per session:

- Model list: `agent_list_models` Tauri command (IPC → agentd `ListModels`), wired via `desktop/soma-app/src/services/chat-service.ts`.
- UI select: `desktop/soma-app/src/routes/chat-sidebar.tsx` shows a compact select (defaults to the first chat model, falls back to agentd default).
- Chat invocation: `useChatConversation` passes the selected model to `agent_chat_stream`.

If no model is selected or the select is empty, agentd still falls back to `--default-chat-model`.

## Tokens, context window, and why `max_tokens=16000` can fail

### Context window

Agentd allocates a context window:

- CLI/env: `--ctx-size` / `SOMA_AGENTD_CTX_SIZE`
- Default: `16384` (`backend/bins/agentd/src/config.rs`)

The maximum possible *new* tokens is:

```
max_new_tokens = ctx_size - prompt_tokens_len
```

### Clamping behavior (important)

Agentd clamps `max_tokens` to the available space in the context window and logs when it clamps.

This prevents “instant failure” when the UI asks for an impossible number of tokens, but it also means:

- very large `max_tokens` does not actually produce that many tokens
- longer conversation history reduces available output budget

### Practical guidance

- Keep `max_tokens` modest in the UI (defaults to `256` in `desktop/soma-app/src/services/chat-service.ts`).
- If you want longer answers, increase `max_tokens` *and* ensure `SOMA_AGENTD_CTX_SIZE` is large enough.
- For “thinking” models, you often need more output budget than for a small instruct model.

## Preventing runaway role-play and transcript continuation

Even with a good model, you want guards:

- stop generating when the model starts emitting a new chat turn delimiter
- use a correct chat template when available
- avoid duplicating BOS tokens when the template already includes them

Agentd enforces this in `backend/bins/agentd/src/engine.rs`:

- Uses the model’s embedded template when present; otherwise selects a fallback (e.g. `llama3` or `chatml`).
- Stops generation when output contains markers like:
  - `<|eot_id|>`, `<|im_end|>`, `<|end_of_text|>`
  - `User:`, `System:`, `Assistant:` (with and without leading newlines)

This is a pragmatic “don’t let the model invent new turns” safety rail for chat UX.

## Troubleshooting

### Symptom: “good morning” returns weather/time/random facts

Most likely you are chatting with a **base model** (or a mismatched template).

Fix:

- switch to an instruct model for chat (e.g. `Meta-Llama-3-8B-Instruct.Q4_K_M.gguf`)
- keep `temperature` low if you want less creative outputs

### Symptom: replies contain `User:`/`System:`/`Assistant:` lines

This means the model is continuing the transcript.

Fix:

- use an instruct model
- ensure the model has a working chat template (agentd will log if it has to fall back)

### Symptom: `Internal error ... failed to decode token`

This was caused by trying to decode each token as UTF-8 directly (some models emit partial / non-UTF-8 token pieces). The engine now streams bytes and accumulates into valid UTF-8 progressively.

If you still see this, capture:

- the model file name
- the last prompt you sent
- your `SOMA_AGENTD_CTX_SIZE` and `max_tokens`

## Quick copy/paste commands

Use Qwen Thinking (as you currently do):

```bash
cargo run -p soma-agentd -- \
  --models-dir "$HOME/dev/models" \
  --default-chat-model Qwen3VL-2B-Thinking-Q4_K_M.gguf
```

Use Llama Instruct (recommended if “Llama base” is weird):

```bash
cargo run -p soma-agentd -- \
  --models-dir "$HOME/dev/models" \
  --default-chat-model Meta-Llama-3-8B-Instruct.Q4_K_M.gguf
```

Increase context window (more memory; only if needed):

```bash
SOMA_AGENTD_CTX_SIZE=32768 cargo run -p soma-agentd -- \
  --models-dir "$HOME/dev/models" \
  --default-chat-model Qwen3VL-2B-Thinking-Q4_K_M.gguf
```
