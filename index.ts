import { trace } from "@opentelemetry/api";
import { ConsoleSpanExporter, SimpleSpanProcessor } from "@opentelemetry/tracing";
import { NodeTracerProvider } from "@opentelemetry/node";
// import { doAutomaticPropagation, doManualPropagation } from "./basicTracing";
import { doClientTracing } from "./clientTracing";

async function tracingExample() {
  //const provider = new BasicTracerProvider();
  const provider = new NodeTracerProvider();
  provider.addSpanProcessor(new SimpleSpanProcessor(new ConsoleSpanExporter()));
  provider.register();
  //trace.setGlobalTracerProvider(provider);
  const tracer = trace.getTracer("example-app", "0.0.1");
  // await doManualPropagation(tracer);
  // await doAutomaticPropagation(tracer);
  await doClientTracing(tracer);
}



async function main() {
  await tracingExample();
}

main().catch(e => console.error(e));