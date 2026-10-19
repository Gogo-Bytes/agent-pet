# Local passive hook runtime

Shared only by Claude and Codex's input/transport wrappers. Provider codecs remain separate and independently validate both native input and normalized wire facts. This module owns no Agent process, configuration, identity inference or Application state.

`readHookInput` takes exclusive ownership of a standard close-emitting stdin stream, bounds bytes/time, and releases listeners even with queued I/O errors. `startHookReceiver` binds IPv4 loopback, validates credentials, exact authority/route/content type, rejects browser origins, bounds peers/body/time and deduplicates only successfully consumed deliveries. Its run gate and sink must be synchronous; shutdown publishes its promise before releasing peers. `deliverHookBody` sends a prevalidated body once with a bounded deadline and never follows redirects or interprets response content.

A request run UUID and short-lived hook socket are not process identity or evidence that an Agent remains online. The caller must independently bind and retire a real host run. Production Claude keeps its existing macOS identity checks and wire protocol. Codex is not yet registered in Main.
