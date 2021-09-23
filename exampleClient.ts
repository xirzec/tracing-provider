import { ClientOptions, makeRequest, OperationOptions } from "./pipeline";
import { createTracingClient, TracingClient } from "./coreTracing";

export class ExampleClient {
  private _tracingClient: TracingClient;

  constructor(options: ClientOptions) {
    this._tracingClient = createTracingClient({
      packagePrefix: "ExampleClient",
      namespace: "example",
      provider: options.tracingProvider,
    });
  }

  async someClientOperation(options: OperationOptions): Promise<void> {
    await makeRequest({ url: "https://example.com/clientOperation", options });
  }
}
