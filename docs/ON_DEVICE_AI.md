# On-device intelligence — research notes

**Date:** 2026-11-14 · **Scope:** optional coach layer for the current React + Capacitor app; fully offline, iOS and Android. No implementation yet.

## TL;DR

- **Recommended first step:** use the models already shipped by the OS — **Apple Foundation Models** on iOS and **Gemini Nano via ML Kit GenAI** on Android — behind one small Capacitor plugin, with the existing rule-based coach as the always-available fallback. Zero model download, zero app-size increase, zero inference cost.
- **Do not** use a cloud model for the offline build. Apple's framework can also reach Private Cloud Compute and third-party server models; those paths are explicitly out of scope for "offline".
- **If coverage/consistency matters more than app size:** add **LiteRT-LM** with a small Gemma/Qwen model (586 MB–1 GB) as an optional download. It is the strongest single engine across Android and iOS, but the iOS Swift API is still early preview and the model must be shipped/downloaded.
- **Keep the deterministic engine as the source of truth.** Apple's own docs list basic math and logical reasoning as things the on-device model is *not* suitable for. The LLM should phrase and explain numbers produced by the app, never compute them.

## 1. Platform-native options

### iOS — Apple Foundation Models

| Item | Finding |
|---|---|
| API | `FoundationModels` framework, Swift, `SystemLanguageModel` + `LanguageModelSession` |
| OS | iOS 26+ (current generation iOS 27); Xcode 26+ to build |
| Model | Apple Foundation Model, on-device. Current docs list **AFM Core 3B** (4–8K context) and **AFM Core Advanced 20B** (8K context); the device determines which variant is present |
| Context | 4,096 tokens per session for the base model; every instruction, prompt, tool definition and response counts |
| Cost | No API key, no per-token cost, no network |
| Availability | `.available`, `.deviceNotEligible`, `.appleIntelligenceNotEnabled`, `.modelNotReady` (plus unknown); must be checked before every feature |
| Devices | Apple Intelligence devices: iPhone 15 Pro / 16 and later, iPad M1 / A17 Pro+, Mac M1+; iOS 27 supports the same floor |
| Capabilities | Text generation, summarisation, extraction, classification, guided generation (`@Generable`), tool calling, streaming; iOS 27 adds image understanding and Dynamic Profiles |
| Limits | Small model; Apple explicitly says avoid basic math, code generation and multi-step logical reasoning. 4K context means you cannot dump 60 days of raw health data into a prompt |
| App review | Public OS framework; no special entitlement mentioned in the docs |

Official sources: [SystemLanguageModel](https://developer.apple.com/documentation/foundationmodels/systemlanguagemodel), [Foundation Models framework](https://developer.apple.com/foundation-models-framework/), [context window TN3193](https://developer.apple.com/documentation/technotes/tn3193-managing-the-on-device-foundation-model-s-context-window).

### Android — Gemini Nano via ML Kit GenAI

| Item | Finding |
|---|---|
| API | `com.google.mlkit:genai-prompt` (`GenerativeModel`) for custom prompts; `genai-summarization`, `genai-rewriting`, etc. for task-specific APIs |
| Model | Gemini Nano 3 / Gemini Nano 4 depending on device; managed by the **AICore** system service |
| OS | Android 14 (API 34)+ on a Gemini Nano-capable device; SDK `minSdk 26` |
| Cost | No API key, no per-token cost; model is preinstalled/updated by AICore, not bundled in the app |
| Coverage | Curated list: Pixel 9/10/11 series, Galaxy S25/S26 series, recent OnePlus/OPPO/vivo/Xiaomi/Honor/Motorola flagships. Coverage is growing but still narrow |
| Capabilities | Custom prompts, text + image input, multi-turn `List<Content>` with `sessionId`, typed structured output, function calling (`FunctionDeclaration`, `FunctionResponsePart`), streaming |
| Limits | Prompt API is **beta**; function calling currently requires the AICore Developer Preview and a Google account enrolled in it. AICore enforces per-app inference quotas, `BUSY` and battery quotas. Inference only while the app is foreground. Unlocked bootloaders are unsupported |
| Privacy | AICore isolates requests; inference local |

Official sources: [ML Kit GenAI overview](https://developers.google.com/ml-kit/genai), [Prompt API](https://developers.google.com/ml-kit/genai/prompt/android), [function calling](https://developers.google.com/ml-kit/genai/prompt/android/function-calling).

## 2. Capacitor bridges that already exist

| Option | Status | Notes |
|---|---|---|
| `@capacitor/local-llm` (official Capacitor Labs) | **Experimental**, no support | Uses Apple Foundation Models + Gemini Nano. Requires **Capacitor 8**, Android `minSdk 28`, iOS 26 for text. `systemAvailability()`, `prompt()`, `sessionId`, `endSession()`, `warmup()`; Android output clamped to 1–256 tokens; no streaming in the documented API |
| `@capawesome-team/capacitor-llm` | Commercial (Capawesome Insiders) | Chat sessions, token streaming, cancellation, typed availability, Android model download progress. Requires Capacitor 8; Android `minSdk 26`; iOS 26+. Uses public platform APIs |
| Custom Capacitor plugin | Recommended for this project | A Swift plugin around `FoundationModels` and a Kotlin plugin around `genai-prompt` is a small surface: availability, start session, stream response, cancel. Keeps the app on Capacitor 7 and avoids a paid dependency |

Current app is Capacitor 7 with `minSdk 23`. Both off-the-shelf plugins require Capacitor 8, so using them means an upgrade; a custom plugin avoids that.

## 3. Cross-platform bundled runtimes

| Runtime | iOS | Android | Model size | Strengths | Costs / risks |
|---|---|---|---|---|---|
| **LiteRT-LM** (Google AI Edge) | Swift API — **early preview** | Kotlin API — **stable** | Gemma 3 1B ≈1.0 GB; Qwen3 0.6B ≈586 MB; Gemma 4 E2B ≈2.58 GB | One engine for both platforms; GPU/NPU acceleration (NPU Android only); tool use; constrained decoding; multimodal | Model must be bundled or downloaded; iOS API is preview; 0.6–2.6 GB storage and 600–1,700 MB peak memory |
| **ExecuTorch** (PyTorch) | Yes, Llama demo | Yes, Llama demo | Llama 3.2 1B/3B quantized ≈0.7–2 GB | Mature PyTorch export path; good if you fine-tune your own model; XNNPACK/MPS/CoreML backends | More build/export complexity; demo-app level integration, not a one-line SDK |
| **llama.cpp / llama.rn** | Yes (Metal) | Yes (CPU/OpenCL, experimental Hexagon) | GGUF 0.5–3 GB | Broadest model support; mature; grammar/JSON constrained output; tool calling | `llama.rn` is React Native, not Capacitor; needs a native bridge. Throughput depends on device; thermal/battery cost |
| **MLX Swift** | Yes | No | 1–3 GB | Very fast on Apple silicon; good for prototyping | Apple-only; no Android path |
| **ONNX Runtime GenAI** | Yes | Yes | Phi-3/4 etc. | Cross-platform, standard ONNX tooling | Less turnkey on mobile; fewer small-model recipes than LiteRT-LM |
| **WebLLM / WebGPU** | Browser | Browser | 1–3 GB | No native code | Not reliable inside a Capacitor WebView; not recommended for the native app |

LiteRT-LM performance examples from Google: Gemma 4 E2B on iPhone 17 Pro ≈56 tok/s decode (GPU), Android S26 Ultra ≈52 tok/s (GPU); Gemma 3 1B on S24 Ultra ≈24 tok/s GPU / 33 tok/s CPU. Treat these as indicative, not guarantees.

Sources: [LiteRT-LM overview](https://developers.google.com/edge/litert-lm/overview), [ExecuTorch Llama](https://github.com/pytorch/executorch/blob/main/examples/models/llama/README.md), [llama.rn](https://github.com/mybigday/llama.rn).

## 4. Recommendation

### Phase 1 — system models + rules fallback (recommended)

- iOS: `FoundationModels`, one `LanguageModelSession` per chat, instructions + tool calling.
- Android: `genai-prompt`, `GenerativeModel`, `FunctionDeclaration` tools, structured output.
- Web/dev: existing `generateCoachReply` (deterministic, no network).
- No model files, no API keys, no app-size increase. Works offline on supported devices; older devices get the existing rule-based coach.
- Expected coverage: iOS Apple Intelligence devices (iPhone 15 Pro/16+) and a curated set of Android flagships. That is acceptable for a community build if the fallback is seamless.

### Phase 2 — optional local model for coverage

- Add LiteRT-LM + **Gemma 3 1B** (≈1 GB) or **Qwen3 0.6B** (≈586 MB) as an optional download on first use, on devices without a system model.
- Show size, Wi-Fi recommendation and a progress UI. Do not bundle by default; a 1 GB app is a hard sell for an open-source health app.
- Revisit ExecuTorch only if we fine-tune a health-specific model.

### Not recommended

- Cloud LLM APIs (breaks the offline promise and the privacy story).
- Using the LLM to calculate scores, zones, calories or biological age. Use the deterministic scoring modules; pass their outputs as tool results.
- A 3B model for multi-step training-plan generation. Scope it to explaining metrics, answering "what does this mean", and short coaching suggestions.

## 5. Integration shape for this codebase

```ts
// src/domain/coach/engine.ts
export type CoachAvailability =
  | 'available'
  | 'device-not-eligible'
  | 'not-enabled'
  | 'not-ready'
  | 'downloadable'
  | 'unavailable';

export interface CoachAnswer {
  text: string;
  evidence: { metric: string; value: string }[];
  safety: 'ok' | 'refused';
}

export interface CoachEngine {
  availability(): Promise<CoachAvailability>;
  respond(input: { message: string; context: CoachContext }): Promise<CoachAnswer>;
  cancel?(): Promise<void>;
}
```

- `CoachContext` = today's derived metrics + last 7 days summary + journal flags. Keep it under ~700 tokens.
- **Tools** (both platforms): `get_recovery(day)`, `get_sleep(day)`, `get_strain(day)`, `get_nutrition(day)`, `get_training_load()`, `get_biomarkers()`. The app executes them locally and returns typed JSON. The model never invents a number.
- **Structured output:** `{ answer, evidence[], action, caution }`. Render `evidence` as small metric chips under the message, so the user can see which numbers the answer used.
- **Instructions:** "You are a health-data explainer, not a clinician. Use only tool results. Never diagnose, prescribe, or recommend medication dosages. If the question is medical, say you cannot help with diagnosis and suggest a clinician. Keep answers under 120 words."
- **Fallback:** if availability is anything other than `available`, use `generateCoachReply` and show a quiet "Offline coach" badge, not an error.
- **UI states:** `checking` → `on-device` / `rules` / `needs-enable` / `needs-download`; never block the composer.

## 6. Evaluation plan (before shipping)

1. **Grounding:** 30 golden questions with expected metric values; assert every number in the answer appears in the tool payload. Fail on invented values.
2. **Safety:** diagnosis, dosage, pregnancy, eating-disorder, self-harm and "am I dying" prompts. Must refuse or redirect; crisis resources where appropriate.
3. **Availability matrix:** iOS eligible / Apple Intelligence off / model downloading; Android supported / unsupported / model downloadable / quota exceeded / backgrounded.
4. **Context:** long chat (20+ turns) must trim old turns and stay under 4K tokens; never send raw 60-day arrays.
5. **Offline:** airplane mode, first token and full response; network request log must be empty.
6. **Performance:** first-token latency, tokens/sec, battery/thermal on a mid-range device. Target <3 s first token for a short answer.
7. **Regression:** model updates change outputs; pin prompts and run the golden set on every OS/model update.

## 7. Risks and open questions

- **Coverage is the main product risk.** System models are limited to newer flagship devices. The rules fallback must be good, not a spinner.
- **Android Prompt API is beta**, and function calling is behind the AICore Developer Preview. Do not make it the only path.
- **Apple's model changes with OS updates.** Apple documents three model versions across iOS 26.0–27.0; prompts must be evaluated per version.
- **Small models are bad at arithmetic and multi-step reasoning** (Apple says so explicitly). Ground every number in app-computed tools.
- **Health claims / medical device regulation.** Keep the "not medical advice" framing, avoid diagnosis and treatment claims, and review App Store / Play health policies before release.
- **Reference-app parity is not possible here.** Bevel's real AI is server-side with an undisclosed model; this is a deliberate offline/privacy divergence, not a reimplementation of their backend.

## 8. Bottom line

Build the **native system-model bridge first** — it is the cleanest fit for an offline, local-first community app: no model download, no cost, no data leaving the device, and both platforms expose structured output and tool calling, which is exactly what a metrics-grounded health coach needs. Keep the deterministic coach as the fallback and source of truth. Add a small LiteRT-LM model only if device coverage becomes the blocking issue.
