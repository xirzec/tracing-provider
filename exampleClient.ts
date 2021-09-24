import { ClientOptions, makeRequest, OperationOptions } from "./pipeline";
import { createTracingClient, TracingClient } from "./coreTracing";

export class ExampleClient {
  private _tracingClient: TracingClient;

  constructor(options?: ClientOptions) {
    this._tracingClient = createTracingClient({
      packagePrefix: "ExampleClient",
      namespace: "example",
      provider: options?.tracingProvider,
    });
  }

  async someClientOperation(options?: OperationOptions): Promise<void> {
    await this._tracingClient.withWrappedSpan(
      "someClientOperation",
      async (updatedOptions) => {
        await makeRequest({ url: "https://example.com/clientOperation", options: updatedOptions });
      },
      { operationOptions: options }
    );
  }

  async someOtherClientOperation(options?: OperationOptions): Promise<void> {
    const { span, updatedOptions } = await this._tracingClient.createSpan(
      "someOtherClientOperation",
      { operationOptions: options }
    );

    try {
      await makeRequest({
        url: "https://example.com/otherClientOperation",
        options: updatedOptions,
      });
      span.setSuccess();
    } catch (e) {
      span.setFailure(e as Error);
    } finally {
      span.end();
    }
  }
}
