import { readFile } from 'node:fs/promises';
import path from 'node:path';

export async function GET(): Promise<Response> {
  const loaderPath = path.join(process.cwd(), '..', 'gujarat_police_loader.html');
  const loaderHtml = await readFile(loaderPath, 'utf8');

  return new Response(loaderHtml, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}