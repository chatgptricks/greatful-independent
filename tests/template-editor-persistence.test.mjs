/* Run: node --test tests/template-editor-persistence.test.mjs
 * The real TypeScript modules are compiled in memory. Only environment,
 * authentication, and the external database boundary are replaced. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requireModule = createRequire(import.meta.url);
function loadModule(relative, dependencies = {}, environment = process) {
  const filename = path.join(root, relative);
  const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: filename,
  }).outputText;
  const compiled = vm.runInThisContext(
    `(function(require,module,exports,process){${source}\n})`,
    { filename },
  );
  const unit = { exports: {} };
  compiled(
    (name) =>
      Object.hasOwn(dependencies, name)
        ? dependencies[name]
        : requireModule(name),
    unit,
    unit.exports,
    environment,
  );
  return unit.exports;
}

const model = loadModule("lib/template-editor/model.ts");
const newLibrary = (name) => {
  const library = structuredClone(model.EMPTY_LIBRARY);
  return model.withBrandKits(library, [{ ...model.activeBrandKit(library), name }]);
};

function persistence(t, options = {}) {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "greatful-editor-test-"),
  );
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return loadModule(
    "lib/template-editor/persistence.ts",
    {
      "@/lib/supabase/admin": { getAdminSupabase: () => options.db ?? null },
      "./model": model,
    },
    {
      cwd: () => directory,
      env: { NODE_ENV: options.production ? "production" : "test" },
    },
  );
}

function fakeDatabase() {
  const rows = new Map();
  return {
    rows,
    from(table) {
      assert.equal(table, "gf_client_state");
      const conditions = new Map();
      let update = null;
      const query = {
        select() {
          return query;
        },
        eq(column, value) {
          conditions.set(column, value);
          return query;
        },
        update(value) {
          update = structuredClone(value);
          return query;
        },
        async insert(value) {
          if (rows.has(value.owner)) return { error: { code: "23505" } };
          rows.set(value.owner, structuredClone(value));
          return { error: null };
        },
        async maybeSingle() {
          const owner = conditions.get("owner");
          const row = rows.get(owner);
          if (update) {
            if (!row || row.data.revision !== conditions.get("data->>revision"))
              return { data: null, error: null };
            rows.set(owner, { ...row, ...update });
            return { data: { owner }, error: null };
          }
          return { data: row ? structuredClone(row) : null, error: null };
        },
      };
      return query;
    },
  };
}

test("development saves persist atomically and are isolated from other owners", async (t) => {
  const store = persistence(t);
  const initial = await store.getEditorLibrary("owner");
  assert.equal(initial.revision, null);
  assert.equal(initial.storage, "local");
  const saved = await store.saveEditorLibrary(
    "owner",
    newLibrary("My studio"),
    null,
  );
  assert.equal(
    (await store.getEditorLibrary("owner")).library.brand.name,
    "My studio",
  );
  assert.equal((await store.getEditorLibrary("member-other")).revision, null);
  assert.notEqual(
    saved.scope,
    (await store.getEditorLibrary("member-other")).scope,
  );
  const updated = await store.saveEditorLibrary(
    "owner",
    newLibrary("Updated studio"),
    saved.revision,
  );
  assert.notEqual(updated.revision, saved.revision);
});

test("concurrent development saves allow exactly one writer", async (t) => {
  const store = persistence(t);
  const outcomes = await Promise.allSettled([
    store.saveEditorLibrary("owner", newLibrary("Tab one"), null),
    store.saveEditorLibrary("owner", newLibrary("Tab two"), null),
  ]);
  assert.equal(
    outcomes.filter((value) => value.status === "fulfilled").length,
    1,
  );
  const failure = outcomes.find((value) => value.status === "rejected");
  assert.ok(failure.reason instanceof store.LibraryConflictError);
  assert.equal(
    (await store.getEditorLibrary("owner")).library.brand.name,
    "Tab one",
  );
});

test("production without cloud storage fails instead of acknowledging a temporary file save", async (t) => {
  const store = persistence(t, { production: true });
  await assert.rejects(store.getEditorLibrary("owner"), /not configured/);
  await assert.rejects(
    store.saveEditorLibrary("owner", newLibrary("Never saved"), null),
    /not configured/,
  );
});

test("cloud writes use a separate namespace and reject stale revisions atomically", async (t) => {
  const db = fakeDatabase();
  db.rows.set("owner", { owner: "owner", data: { legacyResearch: true } });
  const store = persistence(t, { db, production: true });
  const first = await store.saveEditorLibrary(
    "owner",
    newLibrary("First"),
    null,
  );
  assert.equal(first.storage, "cloud");
  const results = await Promise.allSettled([
    store.saveEditorLibrary("owner", newLibrary("Second"), first.revision),
    store.saveEditorLibrary("owner", newLibrary("Stale"), first.revision),
  ]);
  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1,
  );
  assert.ok(
    results.find((result) => result.status === "rejected").reason instanceof
      store.LibraryConflictError,
  );
  assert.deepEqual(db.rows.get("owner").data, { legacyResearch: true });
  assert.equal(
    (await store.getEditorLibrary("owner")).library.brand.name,
    "Second",
  );
  await assert.rejects(
    store.saveEditorLibrary("owner", newLibrary("Overwrite"), null),
    store.LibraryConflictError,
  );
});

test("unreadable saved cloud data does not silently become an empty library", async (t) => {
  const db = fakeDatabase();
  db.rows.set("template-editor:owner", {
    owner: "template-editor:owner",
    data: { unexpected: true },
  });
  const store = persistence(t, { db });
  await assert.rejects(store.getEditorLibrary("owner"), /not been overwritten/);
  assert.deepEqual(db.rows.get("template-editor:owner").data, {
    unexpected: true,
  });
});

function route(access, store, env = {}) {
  return loadModule(
    "app/api/template-editor/route.ts",
    {
      "@/lib/grateful-future/member": { resolveGFAccess: async () => access },
      "@/lib/template-editor/model": model,
      "@/lib/template-editor/persistence": store,
    },
    { env },
  );
}

test("API rejects unauthenticated reads and writes before touching storage", async () => {
  const api = route(null, {});
  assert.equal((await api.GET()).status, 401);
  assert.equal(
    (
      await api.PUT(
        new Request("http://localhost/api/template-editor", {
          method: "PUT",
          body: "{}",
        }),
      )
    ).status,
    401,
  );
});

test("API scopes writes to authenticated identity and returns conflicts", async (t) => {
  const store = persistence(t);
  const api = route({ kind: "member", ownerKey: "actual-member" }, store);
  const request = (revision) =>
    new Request("http://localhost/api/template-editor", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost",
      },
      body: JSON.stringify({
        owner: "forged-member",
        library: newLibrary("Private"),
        revision,
      }),
    });
  const first = await api.PUT(request(null));
  assert.equal(first.status, 200);
  assert.equal(first.headers.get("cache-control"), "private, no-store");
  assert.equal((await api.PUT(request(null))).status, 409);
  assert.equal(
    (await store.getEditorLibrary("actual-member")).library.brand.name,
    "Private",
  );
  assert.equal((await store.getEditorLibrary("forged-member")).revision, null);
});

test("API validates actual streamed body size, schemas, and cross-origin writes", async (t) => {
  const api = route({ kind: "owner", ownerKey: "owner" }, persistence(t));
  const request = (body, headers = {}) =>
    new Request("http://localhost/api/template-editor", {
      method: "PUT",
      body,
      headers,
    });
  assert.equal((await api.PUT(request('{"library":{}}'))).status, 400);
  assert.equal((await api.PUT(request("{broken"))).status, 400);
  assert.equal(
    (await api.PUT(request("{}", { Origin: "https://another-site.test" })))
      .status,
    403,
  );
  assert.equal(
    (await api.PUT(request(" ".repeat(12 * 1024 * 1024 + 1)))).status,
    413,
  );
});

test("API accepts configured public origins behind a reverse proxy and rejects untrusted origins", async (t) => {
  const store = persistence(t);
  const api = route({ kind: "owner", ownerKey: "owner" }, store, {
    NODE_ENV: "production",
    NEXT_PUBLIC_SITE_URL: "https://Studio.Example:443/",
    RENDER_EXTERNAL_URL: "https://greatful-independent.onrender.com/",
  });
  let revision = null;
  const request = (origin, headers = {}) => new Request("http://localhost:10000/api/template-editor", {
    method: "PUT",
    headers: { "Content-Type": "application/json", Origin: origin, ...headers },
    body: JSON.stringify({ library: newLibrary("Behind the proxy"), revision }),
  });
  for (const origin of ["https://studio.example", "https://greatful-independent.onrender.com", "http://localhost:10000"]) {
    const result = await api.PUT(request(origin));
    assert.equal(result.status, 200, origin);
    revision = (await result.json()).revision;
  }
  for (const origin of ["https://studio.example.attacker.test", "http://studio.example", "https://studio.example/path", "https://studio.example#fragment", "null", ""]) {
    assert.equal((await api.PUT(request(origin))).status, 403, origin);
  }
  assert.equal((await api.PUT(request("https://attacker.test", {
    "x-forwarded-host": "attacker.test", "x-forwarded-proto": "https",
  }))).status, 403);
  assert.equal((await store.getEditorLibrary("owner")).revision, revision);
});

test("API ignores malformed or credential-bearing configured origins", async (t) => {
  const api = route({ kind: "owner", ownerKey: "owner" }, persistence(t), {
    NEXT_PUBLIC_SITE_URL: "https://user:password@another-site.test",
    RENDER_EXTERNAL_URL: "not a URL",
  });
  const result = await api.PUT(new Request("http://localhost:10000/api/template-editor", {
    method: "PUT", headers: { Origin: "https://another-site.test" }, body: "{}",
  }));
  assert.equal(result.status, 403);
});
