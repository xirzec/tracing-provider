import { TracingProvider, TracingProviderCreateSpanOptions, TracingSpan } from "./coreTracing";
import { Context, context as otContext, Span, SpanStatusCode, trace } from "@opentelemetry/api";

function getErrorMessage(error: Error | string): string {
  if (typeof error === "string") {
    return error;
  } else if (typeof error === "object" && error.message) {
    return error.message;
  } else {
    return "";
  }
}

class TracingSpanWrapper implements TracingSpan {
  private _span: Span;
  constructor(span: Span) {
    this._span = span;
  }
  setAttribute(name: string, value: unknown): void {
    // do some actual type checking on value?
    this._span.setAttribute(name, value as string);
  }
  setFailure(error: Error | string): void {
    this._span.setStatus({ code: SpanStatusCode.ERROR, message: getErrorMessage(error) });
  }
  setSuccess(): void {
    this._span.setStatus({ code: SpanStatusCode.OK });
  }
  end(): void {
    this._span.end();
  }
}

class OpenTelemetryProvider implements TracingProvider {
  createSpan(options: TracingProviderCreateSpanOptions): { span: TracingSpan; context: unknown } {
    let parentContext = (options.context as Context | undefined) ?? otContext.active();
    const tracer = trace.getTracer("@azure/core-tracing");
    const span = tracer.startSpan(options.name, undefined, parentContext);
    const context = trace.setSpan(parentContext, span);
    return { span: new TracingSpanWrapper(span), context };
  }
  withContext<
    CallbackArgs extends unknown[],
    Callback extends (...args: CallbackArgs) => ReturnType<Callback>
  >(
    context: unknown,
    callback: Callback,
    callbackThis?: ThisParameterType<Callback>,
    ...callbackArgs: CallbackArgs
  ): ReturnType<Callback> {
    return otContext.with(context as Context, callback, callbackThis, ...callbackArgs);
  }
}

export function createOpenTelemetryProvider(): TracingProvider {
  return new OpenTelemetryProvider();
}
