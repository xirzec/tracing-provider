export interface RequestOptions {
  url: string;

}
export async function makeRequest(options: RequestOptions): Promise<void> {
  console.log(`Making request to ${options.url}`);
}