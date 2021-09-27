# Tracing Provider Example

This repo showcases a reimagining of what our tracing story could look like if we abstracted tracing rather than relying directly coupling to OpenTelemetry.

## Concepts

### TracingProvider

A Tracing provider (name is non-final) is a new interface that provides a pluggable interop point for using third party tracing libraries like OpenTelemetry.

Users will either pass an instance of this type to each SDK client or set one globally using a method exported from `core-tracing`:

```ts
import { createOpenTelemetryProvider } from "@azure/core-tracing-opentelemetry";
const otProvider = createOpenTelemetryProvider();
const client = new ExampleClient({ tracingProvider: otProvider });
```

```ts
import { createOpenTelemetryProvider } from "@azure/core-tracing-opentelemetry";
import { setDefaultTracingProvider } from "@azure/core-tracing";
const otProvider = createOpenTelemetryProvider();
setDefaultTracingProvider(otProvider);
const client = new ExampleClient();
```

### TracingClient

As an internal implementation detail, SDKs can create what is called a `TracingClient` that encapsulates the given `TracingProvider` and exposes common tracing functionality. It is analagous to the `createSpanFunction` helper in `core-tracing` today.

```ts
export class ExampleClient {
  private _tracingClient: TracingClient;

  constructor(options?: ClientOptions) {
    this._tracingClient = createTracingClient({
      packagePrefix: "ExampleClient",
      namespace: "example",
      provider: options?.tracingProvider,
    });
  }
}
```

Specifically, TracingClient exposes the following methods:

- `createSpan` - Creates a new `TracingSpan` and `TracingContext` for use in instrumenting code. The caller is expected to configure and end the span manually. This method also will update passed in `OperationOptions` such that downstream operations will have an appropriate parent set.
- `withWrappedSpan` - Similar to `createSpan`, but instead of returning a span directly, this method uses a callback to execute an operation. The `TracingSpan` will automatically end when the callback completes or throws.
- `withContext` - Executes a given callback with a given context (this is a way to manually parent spans.)

### TracingContext

This is an immutable data container similar to a `Map`, but with symbols for keys. It is used to pass operation-specific information around, such as parent contexts and spans.

Consumers will create an instance of this class when they want to manually pass a parent context to a given operation.

### TracingSpan

This wraps the native OpenTelemetry `Span` class, but simplifies it down to the interface we actually depend upon and provides some useful abstractions around things like error handling.

## Working Example

Check out [clientTracing.ts](./coreTracing.ts) to see what a customer would see when using this approach.

### Passing Parent Context Manually

Though not required when using OpenTelemetry's automatic context management, a parent context can be passed directly by first wrapping it with `fromProviderContext`:

```ts
import { fromProviderContext } from "@azure/core-tracing-opentelemetry";

const span = tracer.startSpan("Root span for client operations");
const rootContext = trace.setSpan(context.active(), span);
const parentContext = fromProviderContext(rootContext);
await client.someClientOperation({ tracingOptions: { context: parentContext } });
```

## Implementation Notes

### Request Tracing

Because the provider is now able to be set per client, the pipeline cannot assume a global provider (though it can fall back to the global default, when available.)

As such, it must be able to get a reference from `TracingContext` to the `TracingClient` that created it. This is just another symbol key in the opaque data container.
