/// <reference types="vite/client" />

// v0.5 — `?worker&inline` query: ambient declaration so tsc accepts the
// import. Vite rewrites this to a Worker constructor at build time. The
// `&inline` suffix means the worker source ships as a base64 blob in
// the main bundle rather than as a separate .js file.
declare module "*?worker&inline" {
  const WorkerCtor: new () => Worker;
  export default WorkerCtor;
}

declare module "*?worker" {
  const WorkerCtor: new () => Worker;
  export default WorkerCtor;
}
