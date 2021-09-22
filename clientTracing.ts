import { context, SpanStatusCode, trace, Tracer } from "@opentelemetry/api";
import { ExampleClient } from "./exampleClient";

export async function doClientTracing(tracer: Tracer) {
  const span = tracer.startSpan("Root span for client operations");
  const rootContext = trace.setSpan(context.active(), span);

  const client = new ExampleClient();
  context.with(rootContext, async () => {
    client.someClientOperation();
  });
  // pass parent manually?
  client.someClientOperation();
  
  span.setStatus({code: SpanStatusCode.OK});
  span.end();
}