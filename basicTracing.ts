import { Context, context, SpanStatusCode, trace, Tracer } from "@opentelemetry/api";

export async function doManualPropagation(tracer: Tracer) {
  const span = tracer.startSpan("Root span for manual propagation");
  const rootContext = trace.setSpan(context.active(), span);
  await doWork(tracer, rootContext);
  await doWork(tracer, rootContext);
  await doWork(tracer, rootContext);
  
  span.setStatus({code: SpanStatusCode.OK});
  span.end();
}

export async function doAutomaticPropagation(tracer: Tracer) {
  const span = tracer.startSpan("Root span for automatic propagation");
  const rootContext = trace.setSpan(context.active(), span);
  context.with(rootContext, async () => {
    await doWork(tracer);
    await doWork(tracer);
    await doWork(tracer);
  });
  
  span.setStatus({code: SpanStatusCode.OK});
  span.end();
}

async function doWork(tracer: Tracer, parentContext?: Context) {
  const span = tracer.startSpan("Work span", undefined, parentContext);
  await new Promise(resolve => setTimeout(resolve, 500));
  span.setStatus({code: SpanStatusCode.OK});
  span.end();
}