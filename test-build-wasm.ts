import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
console.log(new URL(wasmUrl, import.meta.url).href);
