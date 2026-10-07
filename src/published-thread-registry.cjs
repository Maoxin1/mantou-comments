'use strict';
// The authoritative registry is a public artifact of the trusted production
// blog. This disposable, per-instance cache stores no comments or credentials.
const BLOG = 'https://mantou-blog.pages.dev';
const VERSION_URL = BLOG + '/version.json';
const MANIFEST_URL = BLOG + '/feedback/threads.json';
const CACHE_MS = 60000;
const FETCH_TIMEOUT_MS = 1500;
const MAX_BYTES = 262144;
const MAX_PATHS = 10000;
const canonicalPath = value => typeof value === 'string' && value.length <= 200 && /^\/(?:p|works)\/[A-Za-z0-9_-]+\/$/.test(value);
class RegistryError extends Error {
  constructor(kind) { super('Published discussion registry unavailable'); this.kind = kind; }
}
function validPaths(paths) {
  return Array.isArray(paths) && paths.length <= MAX_PATHS && paths.every(canonicalPath) && new Set(paths).size === paths.length;
}
function exactKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value) && JSON.stringify(Object.keys(value).sort()) === JSON.stringify(keys.slice().sort());
}
function parseJSON(bytes) {
  let text, value;
  try { text = new TextDecoder('utf-8', {fatal:true}).decode(bytes); value = JSON.parse(text); }
  catch { throw new RegistryError('json'); }
  const keys = new Set();
  for (const token of text.matchAll(/"(?:[^"\\]|\\.)*"/g)) {
    if (text.slice(token.index + token[0].length).trimStart().startsWith(':')) {
      const key = JSON.parse(token[0]);
      if (keys.has(key)) throw new RegistryError('schema');
      keys.add(key);
    }
  }
  return value;
}
async function readPublicJSON(url, fetchImpl, limit) {
  const controller = new AbortController();
  let timer, reader;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      if (reader) reader.cancel().catch(() => {});
      reject(new RegistryError('timeout'));
    }, FETCH_TIMEOUT_MS);
  });
  const work = (async () => {
    const response = await fetchImpl(url, {method:'GET', credentials:'omit', redirect:'error', cache:'no-store', headers:{accept:'application/json'}, signal:controller.signal});
    if (response.redirected || response.url !== url) throw new RegistryError('redirect');
    if (response.status !== 200) throw new RegistryError('http');
    if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) throw new RegistryError('content_type');
    const length = response.headers.get('content-length');
    if (length !== null && (!/^(0|[1-9]\d*)$/.test(length) || !Number.isSafeInteger(Number(length)) || Number(length) > limit)) throw new RegistryError('size');
    if (!response.body || typeof response.body.getReader !== 'function') throw new RegistryError('json');
    reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > limit) throw new RegistryError('size');
      chunks.push(Buffer.from(chunk.value));
    }
    return parseJSON(Buffer.concat(chunks, size));
  })();
  try { return await Promise.race([work, deadline]); }
  finally {
    clearTimeout(timer);
    controller.abort();
    if (reader) { try { await reader.cancel(); } catch {} }
  }
}
function createPublishedThreadRegistry({fallbackPaths, fetchImpl=globalThis.fetch, now=Date.now, onRefresh=()=>{}}={}) {
  if (!validPaths(fallbackPaths) || typeof fetchImpl !== 'function' || typeof now !== 'function' || typeof onRefresh !== 'function') throw new TypeError('Invalid published discussion registry configuration');
  let paths = new Set(fallbackPaths), sourceCommit = null, nextRefresh = 0, inFlight;
  const emit = event => { try { onRefresh(Object.freeze(event)); } catch {} };
  async function refresh() {
    try {
      const version = await readPublicJSON(VERSION_URL, fetchImpl, 4096);
      if (!exactKeys(version, ['commit_sha','deploy_branch','run_id','run_attempt']) || version.deploy_branch !== 'main' || typeof version.commit_sha !== 'string' || !/^[a-f0-9]{40}$/.test(version.commit_sha) || typeof version.run_id !== 'string' || !/^[1-9]\d*$/.test(version.run_id) || typeof version.run_attempt !== 'string' || !/^[1-9]\d*$/.test(version.run_attempt)) throw new RegistryError('schema');
      const manifest = await readPublicJSON(MANIFEST_URL, fetchImpl, MAX_BYTES);
      if (!exactKeys(manifest, ['version','sourceCommit','paths']) || manifest.version !== 1 || !validPaths(manifest.paths) || manifest.sourceCommit !== version.commit_sha) throw new RegistryError('version_or_schema');
      const changed = sourceCommit !== manifest.sourceCommit;
      // Replace, rather than union, so unpublished content no longer accepts
      // new submissions. Existing database comments are never deleted here.
      paths = new Set(manifest.paths);
      sourceCommit = manifest.sourceCommit;
      emit({event:'published_threads_refresh',result:changed?'updated':'unchanged',sourceCommit,count:paths.size});
    } catch (error) {
      const failureKind = error instanceof RegistryError ? error.kind : (['AbortError','TimeoutError'].includes(error?.name) ? 'timeout' : 'network');
      emit({event:'published_threads_refresh',result:'unavailable',failureKind,count:paths.size});
    } finally { nextRefresh = now() + CACHE_MS; }
  }
  async function isAllowed(value) {
    if (!canonicalPath(value)) return false;
    if (inFlight) await inFlight;
    else if (now() >= nextRefresh) {
      inFlight = refresh();
      try { await inFlight; } finally { inFlight = undefined; }
    }
    return paths.has(value);
  }
  return Object.freeze({isAllowed,getVersion:()=>sourceCommit});
}
module.exports = {createPublishedThreadRegistry, canonicalPath, CACHE_MS, FETCH_TIMEOUT_MS, VERSION_URL, MANIFEST_URL};
