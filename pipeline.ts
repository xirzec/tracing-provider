import { OperationTracingOptions, TracingProvider } from "./coreTracing";

export interface Request {
  url: string;
  options: OperationOptions;
}

export interface OperationOptions {
  tracingOptions?: OperationTracingOptions;
}

export interface ClientOptions {
  tracingProvider?: TracingProvider;
}

export async function makeRequest(request: Request): Promise<void> {
  console.log(`Making request to ${request.url}`);
}