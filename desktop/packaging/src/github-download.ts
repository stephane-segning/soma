import fse from "fs-extra";
import { createWriteStream, promises as fs } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { logInfo, pathExists } from "./fs-utils.js";
import { assetHeaders } from "./github-http.js";

export async function downloadReleaseAsset(
  url: string,
  dest: string,
  token: string
) {
  await fse.ensureDir(path.dirname(dest));
  if (await pathExists(dest)) {
    await fs.unlink(dest);
  }
  logInfo(`Downloading ${url} -> ${dest}`);
  const response = await fetch(url, {
    headers: assetHeaders(token),
  });
  if (!response.ok) {
    throw new Error(
      `Failed to download asset ${url}: ${response.status} ${response.statusText}`
    );
  }
  if (!response.body) {
    throw new Error(`Missing response body for asset ${url}`);
  }
  await pipeline(
    Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]),
    createWriteStream(dest)
  );
}
