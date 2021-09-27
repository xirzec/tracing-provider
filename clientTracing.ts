import { context, SpanStatusCode, trace, Tracer } from "@opentelemetry/api";
import { createOpenTelemetryProvider, fromProviderContext } from "./openTelemetryProvider";
import { ExampleClient } from "./exampleClient";

export async function doClientTracing(tracer: Tracer) {
  const span = tracer.startSpan("Root span for client operations");
  const rootContext = trace.setSpan(context.active(), span);

  const otProvider = createOpenTelemetryProvider();

  // can also call setDefaultProvider from core-tracing to set globally
  const client = new ExampleClient({ tracingProvider: otProvider });
  await context.with(rootContext, async () => {
    await client.someClientOperation();
    await client.someOtherClientOperation();
  });
  // pass parent manually
  const parentContext = fromProviderContext(rootContext);
  await client.someClientOperation({ tracingOptions: { context: parentContext } });
  await client.someOtherClientOperation({ tracingOptions: { context: parentContext } });

  span.setStatus({ code: SpanStatusCode.OK });
  span.end();
}
