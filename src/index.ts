import { createApp } from "./app.ts";

export async function main(): Promise<void> {
  const app = await createApp();
  await app.start();
}
