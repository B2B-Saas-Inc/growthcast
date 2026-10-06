import {ConfigService} from "@nestjs/config";
import {readFileSync} from "node:fs";
import {Readable} from "node:stream";
import {StorageProvider} from "./storage.interface";

export class SupabaseStorage implements StorageProvider {
  private client: {
    upload(key: string, bytes: Buffer, contentType: string): Promise<void>;
    download(key: string): Promise<{bytes: Buffer; contentType: string}>;
    delete(key: string): Promise<void>;
  };
  constructor(config: ConfigService) {
    // Packaged ESM helper is shared with the standalone live verification runner.
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- Bun loads this fixed external package module synchronously during service construction.
    const {StorageClient} = require("/boundary/deployment/storage/client.mjs");
    this.client = new StorageClient({projectRef:config.getOrThrow("PORTAL_STORAGE_PROJECT_REF"),
      bucket:config.getOrThrow("PORTAL_STORAGE_BUCKET"),maxDownloadBytes:16*1024*1024,
      credentials:JSON.parse(readFileSync("/run/storage/credentials.json","utf8"))});
  }
  upload(key: string, bytes: Buffer, contentType: string) {return this.client.upload(key,bytes,contentType);}
  async download(key: string) {
    const {bytes,contentType} = await this.client.download(key);
    return {body:Readable.from(bytes),contentType};
  }
  delete(key: string) {return this.client.delete(key);}
  async getSignedUrl(): Promise<string> {throw new Error("Use the authorized file download endpoint");}
}
