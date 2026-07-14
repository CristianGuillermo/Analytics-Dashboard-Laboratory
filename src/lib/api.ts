/**
 * api.ts — Cliente HTTP para el Edge Function de Supabase.
 *
 * Todos los endpoints hablan con /make-server-6b1387cf/* sobre HTTPS.
 * Las fechas viajan como ISO strings y se rehidratan a Date en el frontend.
 *
 * Uso:
 *   import { api } from "@/lib/api";
 *   const clases = await api.getClases();
 *   await api.saveClase(claseRegistro);
 */

import { projectId, publicAnonKey } from "../../utils/supabase/info";

// URL base del Edge Function desplegado en Supabase
const BASE = `https://${projectId}.supabase.co/functions/v1/server/make-server-6b1387cf`;

// Cabeceras comunes para todas las llamadas
const headers = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${publicAnonKey}`,
};

// ─── Tipos compartidos con el frontend ────────────────────────────────────────

export interface MaquinaEnClaseDTO {
  idComputadora: number;
  usuarioNombre?: string;
  codigoUsuario?: string;
  horaConexion?: string; // ISO string
  minutos?: number;
}

export interface ClaseRegistroDTO {
  idClase: number;
  docenteNombre: string;
  idLaboratorio: number;
  nombreLaboratorio: string;
  codigoCurso: string;
  nombreCurso: string;
  fecha: string;       // ISO string
  horaInicio: string;  // ISO string
  horaFin?: string;    // ISO string
  duracionMinutos?: number;
  maquinas: MaquinaEnClaseDTO[];
  estado: "EN_CURSO" | "FINALIZADA";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Verifica conexión con el Edge Function. Devuelve true si responde OK. */
export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/health`, { headers });
    return res.ok;
  } catch {
    return false;
  }
}

/** Obtiene todas las clases almacenadas. Devuelve [] si hay error. */
export async function getClases(): Promise<ClaseRegistroDTO[]> {
  try {
    const res = await fetch(`${BASE}/clases`, { headers });
    if (!res.ok) return [];
    const json = await res.json() as { ok: boolean; data: ClaseRegistroDTO[] };
    return json.data ?? [];
  } catch {
    return [];
  }
}

/** Guarda una clase en Supabase. Devuelve true si fue exitoso. */
export async function saveClase(clase: ClaseRegistroDTO): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/clases`, {
      method: "POST",
      headers,
      body: JSON.stringify(clase),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Elimina una clase por su ID numérico. */
export async function deleteClase(idClase: number): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/clases/${idClase}`, {
      method: "DELETE",
      headers,
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ─── Conversor DTO ↔ Domain ───────────────────────────────────────────────────
// Las fechas se serializan como ISO strings sobre HTTP y se convierten a Date
// al rehidratar en el frontend.

export function dtoToClase(dto: ClaseRegistroDTO): ClaseRegistro {
  return {
    ...dto,
    fecha:      new Date(dto.fecha),
    horaInicio: new Date(dto.horaInicio),
    horaFin:    dto.horaFin ? new Date(dto.horaFin) : undefined,
    maquinas:   dto.maquinas.map(m => ({
      ...m,
      horaConexion: m.horaConexion ? new Date(m.horaConexion) : undefined,
    })),
  };
}

export function claseToDTO(c: ClaseRegistro): ClaseRegistroDTO {
  return {
    ...c,
    fecha:      c.fecha.toISOString(),
    horaInicio: c.horaInicio.toISOString(),
    horaFin:    c.horaFin?.toISOString(),
    maquinas:   c.maquinas.map(m => ({
      ...m,
      horaConexion: m.horaConexion?.toISOString(),
    })),
  };
}

// ─── Tipos de dominio (con Date reales) ───────────────────────────────────────
// Se reimportan aquí para que api.ts sea el único import necesario en App.tsx.

export interface MaquinaEnClase {
  idComputadora: number;
  usuarioNombre?: string;
  codigoUsuario?: string;
  horaConexion?: Date;
  minutos?: number;
}

export interface ClaseRegistro {
  idClase: number;
  docenteNombre: string;
  idLaboratorio: number;
  nombreLaboratorio: string;
  codigoCurso: string;
  nombreCurso: string;
  fecha: Date;
  horaInicio: Date;
  horaFin?: Date;
  duracionMinutos?: number;
  maquinas: MaquinaEnClase[];
  estado: "EN_CURSO" | "FINALIZADA";
}

// Export api object for convenience
export const api = { checkHealth, getClases, saveClase, deleteClase, dtoToClase, claseToDTO };

/*
Este archivo crea un cliente de comunicación entre el frontend React y el servidor
de Supabase mediante solicitudes HTTP. Define la URL del servicio, las cabeceras
de autenticación y las funciones para verificar la conexión, obtener, guardar y
eliminar registros de clases.

También establece los tipos de datos usados por el sistema, como información de
laboratorios, docentes, cursos y máquinas conectadas. Incluye conversores que
transforman las fechas entre el formato enviado por la API (ISO string) y el
formato utilizado dentro de la aplicación (Date), facilitando el manejo de datos.
*/
