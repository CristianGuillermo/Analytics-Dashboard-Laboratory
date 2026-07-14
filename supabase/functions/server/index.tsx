import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import * as kv from "./kv_store.tsx";
// ─── Types ────────────────────────────────────────────────────────────────────
// Mirrors the frontend interfaces. Dates are serialized as ISO strings over HTTP.
interface MaquinaEnClase {
  idComputadora: number;
  usuarioNombre?: string;
  codigoUsuario?: string;
  horaConexion?: string; // ISO string
  minutos?: number;
}
interface ClaseRegistro {
  idClase: number;
  docenteNombre: string;
  idLaboratorio: number;
  nombreLaboratorio: string;
  codigoCurso: string;
  nombreCurso: string;
  fecha: string;        // ISO string
  horaInicio: string;   // ISO string
  horaFin?: string;     // ISO string
  duracionMinutos?: number;
  maquinas: MaquinaEnClase[];
  estado: "EN_CURSO" | "FINALIZADA";
}
// ─── KV keys ─────────────────────────────────────────────────────────────────
const CLASES_KEY = "lab:clases";
// ─── App ─────────────────────────────────────────────────────────────────────
const app = new Hono();
app.use("*", logger(console.log));
app.use("/*", cors({
  origin: "*",
  allowHeaders: ["Content-Type", "Authorization"],
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  exposeHeaders: ["Content-Length"],
  maxAge: 600,
}));
// Health check
app.get("/make-server-6b1387cf/health", (c) => c.json({ status: "ok" }));
// ── GET /clases ── devuelve todas las clases almacenadas ──────────────────────
app.get("/make-server-6b1387cf/clases", async (c) => {
  try {
    const clases: ClaseRegistro[] = (await kv.get(CLASES_KEY)) ?? [];
    return c.json({ ok: true, data: clases });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ ok: false, error: msg }, 500);
  }
});
// ── POST /clases ── guarda una nueva clase (append) ───────────────────────────
app.post("/make-server-6b1387cf/clases", async (c) => {
  try {
    const body = await c.req.json<ClaseRegistro>();
    const clases: ClaseRegistro[] = (await kv.get(CLASES_KEY)) ?? [];

    // Evita duplicados por idClase
    const sinDuplicado = clases.filter(cl => cl.idClase !== body.idClase);
    const actualizadas = [body, ...sinDuplicado]; // más reciente primero

    await kv.set(CLASES_KEY, actualizadas);
    return c.json({ ok: true, data: body }, 201);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ ok: false, error: msg }, 500);
  }
});
// ── DELETE /clases/:id ── elimina una clase por ID ───────────────────────────
app.delete("/make-server-6b1387cf/clases/:id", async (c) => {
  try {
    const id = Number(c.req.param("id"));
    const clases: ClaseRegistro[] = (await kv.get(CLASES_KEY)) ?? [];
    await kv.set(CLASES_KEY, clases.filter(cl => cl.idClase !== id));
    return c.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ ok: false, error: msg }, 500);
  }
});
// ── DELETE /clases ── limpia todas las clases (útil para desarrollo) ──────────
app.delete("/make-server-6b1387cf/clases", async (c) => {
  try {
    await kv.del(CLASES_KEY);
    return c.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ ok: false, error: msg }, 500);
  }
});
Deno.serve(app.fetch);
