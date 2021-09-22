import { makeRequest } from "./pipeline";

export class ExampleClient {

  async someClientOperation(): Promise<void> {
    await makeRequest({url: "https://example.com/clientOperation"});
  }
}