import { OperationTracingOptions, TracingProvider } from "./coreTracing";
import { getTracingClientFromContext, createTracingClient } from "./coreTracing";

export interface Request {
  url: string;
  options?: OperationOptions;
}

export interface OperationOptions {
  tracingOptions?: OperationTracingOptions;
}

export interface ClientOptions {
  tracingProvider?: TracingProvider;
}

const defaultTracingClient = createTracingClient({ namespace: "", packagePrefix: "" });

export async function makeRequest(request: Request): Promise<void> {
  const tracingClient =
    getTracingClientFromContext(request.options?.tracingOptions?.context) ?? defaultTracingClient;

  const { span } = tracingClient.createSpan(request.url, {
    operationOptions: request.options,
    ignorePackagePrefix: true,
  });
  console.log(`Making request to ${request.url}`);
  // use tracingClient.withContext to make any underlying http calls, so these are parented properly
  span.end();
}
