import { trace } from "@opentelemetry/api";
import { ConsoleSpanExporter, SimpleSpanProcessor } from "@opentelemetry/tracing";
import { NodeTracerProvider } from "@opentelemetry/node";
import { doClientTracing } from "./clientTracing";

async function tracingExample() {
  const provider = new NodeTracerProvider();
  provider.addSpanProcessor(new SimpleSpanProcessor(new ConsoleSpanExporter()));
  provider.register();
  const tracer = trace.getTracer("example-app", "0.0.1");
  await doClientTracing(tracer);
}

async function main() {
  await tracingExample();
}

main().catch((e) => console.error(e));
