/**
 * App.tsx — Dashboard de Control de Laboratorios
 *
 * Capas del archivo (en orden):
 *   1. MODELOS     — Interfaces TypeScript (forma de los datos)
 *   2. DATOS MOCK  — Arrays y generadores de datos ficticios
 *   3. SERVICIOS   — Funciones que simulan llamadas a una API
 *   4. UTILIDADES  — Helpers de formato y cálculo
 *   5. ICONOS      — SVG inline como componentes funcionales
 *   6. UI SHARED   — Tooltip de gráficas y tarjeta KPI reutilizable
 *   7. VISTAS      — Login · Sidebar · DirectorDashboard · EncargadoDashboard
 *   8. ROOT        — <App /> gestiona sesión y selecciona qué vista renderizar
 *
 * Convención de clases:
 *   Cada className usa el patrón array.join(" ") con un comentario
 *   por línea explicando qué hace esa clase de Tailwind CSS.
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { toast, Toaster } from "sonner";
import {
  type ClaseRegistro,
  type MaquinaEnClase,
  api,
  dtoToClase,
  claseToDTO,
} from "@/lib/api";

// ─────────────────────────────────────────────────────────────────────────────
// GRÁFICAS — Implementación SVG/CSS propia (sin Recharts).
// Recharts v2.15 genera claves duplicadas en el DOM SVG cuando hay múltiples
// instancias de chart en la misma página. Estos componentes son más ligeros,
// tienen control total de estilos y no dependen de ninguna librería.
// ─────────────────────────────────────────────────────────────────────────────

/** Colores de las 4 barras: uno por laboratorio (índice 0-3). */
const BAR_COLORS = ["#111111", "#555555", "#999999", "#16a34a"];

/**
 * HorasBarChart — Gráfica de barras horizontales para comparar horas por lab.
 * Usa divs CSS con `width` porcentual. Sin SVG ni librería.
 */
function HorasBarChart({ data }: { data: Array<{ nombre: string; horas: number }> }) {
  const max = Math.max(...data.map(d => d.horas), 1);
  return (
    <div className="space-y-4 pt-2">
      {data.map((d, i) => (
        <div key={d.nombre}>
          {/* Fila de etiqueta + valor */}
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-muted-foreground" style={{ fontFamily: "DM Mono, monospace" }}>
              {d.nombre}
            </span>
            <span className="text-xs font-semibold text-foreground" style={{ fontFamily: "DM Mono, monospace" }}>
              {d.horas} hrs
            </span>
          </div>
          {/* Pista de la barra */}
          <div className="h-5 bg-secondary rounded-md overflow-hidden">
            {/* Relleno proporcional al máximo */}
            <div
              className="h-full rounded-md transition-all duration-700"
              style={{ width: `${(d.horas / max) * 100}%`, background: BAR_COLORS[i % BAR_COLORS.length] }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * AfluenciaLineChart — Gráfica de área SVG para la distribución horaria.
 * Calcula los puntos proporcionalmente al contenedor (viewBox 400×160).
 * Sin librería externa.
 */
function AfluenciaLineChart({ data }: { data: Array<{ hora: string; cantidad: number }> }) {
  const W = 400; const H = 160;
  const PAD = { t: 12, r: 8, b: 28, l: 28 }; // márgenes internos del área de trazado
  const iw  = W - PAD.l - PAD.r;              // ancho interior
  const ih  = H - PAD.t - PAD.b;              // alto interior
  const max = Math.max(...data.map(d => d.cantidad), 1);
  const n   = data.length;

  /** Transforma un índice + valor a coordenadas SVG. */
  const pt = (i: number, val: number) => ({
    x: PAD.l + (i / (n - 1)) * iw,
    y: PAD.t + ih - (val / max) * ih,
  });

  const pts   = data.map((d, i) => pt(i, d.cantidad));
  const line  = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  // Cierra el path por debajo para crear el área de relleno
  const area  = `${line} L ${pts[n - 1].x.toFixed(1)} ${(PAD.t + ih).toFixed(1)} L ${pts[0].x.toFixed(1)} ${(PAD.t + ih).toFixed(1)} Z`;

  // Líneas de referencia horizontales (3 niveles)
  const gridY = [0, 0.5, 1].map(r => PAD.t + ih * (1 - r));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 170, display: "block" }}>
      {/* Líneas de referencia */}
      {gridY.map((y, i) => (
        <line key={`grid-${i}`} x1={PAD.l} y1={y} x2={W - PAD.r} y2={y}
          stroke="#e5e5e5" strokeWidth={1} strokeDasharray="3 4" />
      ))}

      {/* Área de relleno */}
      <path d={area} fill="#111111" fillOpacity={0.07} />

      {/* Línea principal */}
      <path d={line} fill="none" stroke="#111111" strokeWidth={1.5}
        strokeLinejoin="round" strokeLinecap="round" />

      {/* Puntos en cada hora */}
      {pts.map((p, i) => (
        <circle key={`dot-${i}`} cx={p.x} cy={p.y} r={2.5} fill="#111111" />
      ))}

      {/* Etiquetas del eje X — cada 2 horas para evitar solapamiento */}
      {data.map((d, i) => i % 2 === 0 && (
        <text key={`lbl-${i}`} x={pts[i].x} y={H - 6}
          textAnchor="middle" fontSize={9} fill="#888888"
          fontFamily="DM Mono, monospace">
          {d.hora}
        </text>
      ))}

      {/* Etiquetas del eje Y */}
      {[0, Math.round(max / 2), max].map((v, i) => (
        <text key={`gy-${i}`}
          x={PAD.l - 4}
          y={PAD.t + ih - (v / max) * ih + 4}
          textAnchor="end" fontSize={9} fill="#888888"
          fontFamily="DM Mono, monospace">
          {v}
        </text>
      ))}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. MODELOS
// ─────────────────────────────────────────────────────────────────────────────

/** Roles del sistema. Define qué vista se muestra tras autenticar. */
type Rol = "DIRECTOR" | "ENCARGADO" | "DOCENTE";

/**
 * Estado operativo de una computadora:
 *   DISPONIBLE    → libre, sin sesión activa
 *   EN_USO        → hay un estudiante; muestra código y contador
 *   MANTENIMIENTO → fuera de servicio temporalmente
 */
type EstadoPC = "DISPONIBLE" | "EN_USO" | "MANTENIMIENTO";

/** Usuario web. El Encargado tiene idLaboratorioAsignado; el Director no. */
interface UsuarioWeb {
  idUsuario: number;
  username: string;
  password: string;
  rol: Rol;
  nombre: string;
  idLaboratorioAsignado?: number;
}

/** Laboratorio físico. totalPcs es siempre 20 por política institucional. */
interface Laboratorio {
  id: number;
  nombre: string;
  encargado: string;
  totalPcs: 20;
  horarioApertura: string;
  horarioCierre: string;
}

/** PC individual dentro de un laboratorio. */
interface Computadora {
  idComputadora: number;
  idLaboratorio: number;
  estado: EstadoPC;
  usuarioActual?: string;   // presente solo si estado === "EN_USO"
  minutosUsoHoy: number;
  inicioSesion?: Date;      // para calcular minutos transcurridos en la sesión activa
}

/** Sesión de uso completada. Fuente de la auditoría del Director. */
interface RegistroUso {
  idRegistro: number;
  codigoEstudiante: string;
  idComputadora: number;
  idLaboratorio: number;
  horaInicio: Date;
  horaFin: Date;
  minutosTotales: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. DATOS MOCK
// ─────────────────────────────────────────────────────────────────────────────

const USUARIOS: UsuarioWeb[] = [
  { idUsuario: 1, username: "director",   password: "director123", rol: "DIRECTOR",  nombre: "Dr. Carlos Mendoza" },
  { idUsuario: 2, username: "encargado1", password: "lab1pass",    rol: "ENCARGADO", nombre: "Ing. Ana Torres",    idLaboratorioAsignado: 1 },
  { idUsuario: 3, username: "encargado2", password: "lab2pass",    rol: "ENCARGADO", nombre: "Ing. Roberto Silva", idLaboratorioAsignado: 2 },
  { idUsuario: 4, username: "encargado3", password: "lab3pass",    rol: "ENCARGADO", nombre: "Ing. María López",   idLaboratorioAsignado: 3 },
  { idUsuario: 5, username: "encargado4", password: "lab4pass",    rol: "ENCARGADO", nombre: "Ing. Jorge Ramírez", idLaboratorioAsignado: 4 },
  { idUsuario: 6, username: "docente1",   password: "doc1pass",    rol: "DOCENTE",   nombre: "Prof. María García" },
  { idUsuario: 7, username: "docente2",   password: "doc2pass",    rol: "DOCENTE",   nombre: "Prof. Carlos Ruiz" },
  { idUsuario: 8, username: "docente3",   password: "doc3pass",    rol: "DOCENTE",   nombre: "Prof. Ana Martínez" },
];

/** Asignatura dictada en laboratorio. */
interface Curso { idCurso: number; codigo: string; nombre: string; }

/** Catálogo de cursos. */
const CURSOS: Curso[] = [
  { idCurso: 1, codigo: "INF101", nombre: "Introducción a la Programación" },
  { idCurso: 2, codigo: "INF201", nombre: "Algoritmos y Estructuras de Datos" },
  { idCurso: 3, codigo: "RED101", nombre: "Fundamentos de Redes" },
  { idCurso: 4, codigo: "BD101",  nombre: "Base de Datos I" },
  { idCurso: 5, codigo: "WEB201", nombre: "Desarrollo Web" },
  { idCurso: 6, codigo: "SO101",  nombre: "Sistemas Operativos" },
  { idCurso: 7, codigo: "MUL101", nombre: "Multimedia Digital" },
  { idCurso: 8, codigo: "SEC201", nombre: "Seguridad Informática" },
];

/** Nombres de estudiantes para el monitoreo en tiempo real. */
const NOMBRES_ESTUDIANTES = [
  "Juan Pérez","Ana López","Carlos García","María Torres","Luis Rodríguez",
  "Sofía Martínez","Diego Flores","Valentina Castro","Andrés Morales","Camila Jiménez",
  "Pablo Díaz","Isabella Vargas","Sebastián Reyes","Lucía Herrera","Mateo Núñez",
];

const LABORATORIOS: Laboratorio[] = [
  { id: 1, nombre: "Lab. Informática A", encargado: "Ing. Ana Torres",    totalPcs: 20, horarioApertura: "08:00", horarioCierre: "20:00" },
  { id: 2, nombre: "Lab. Redes",          encargado: "Ing. Roberto Silva", totalPcs: 20, horarioApertura: "07:30", horarioCierre: "19:30" },
  { id: 3, nombre: "Lab. Programación",   encargado: "Ing. María López",   totalPcs: 20, horarioApertura: "08:00", horarioCierre: "21:00" },
  { id: 4, nombre: "Lab. Multimedia",     encargado: "Ing. Jorge Ramírez", totalPcs: 20, horarioApertura: "09:00", horarioCierre: "20:00" },
];

const CODIGOS = [
  "EST2401","EST2402","EST2403","EST2404","EST2405",
  "EST2406","EST2407","EST2408","EST2409","EST2410",
  "EST2411","EST2412","EST2413","EST2414","EST2415",
];

/** Genera 80 PCs (20 × 4 labs) con estados deterministas (sin Math.random). */
function generarComputadoras(): Computadora[] {
  const pcs: Computadora[] = [];
  let id = 1;
  for (let lab = 1; lab <= 4; lab++) {
    for (let n = 1; n <= 20; n++) {
      const r = (id * 7 + lab * 13 + n * 3) % 10;
      const estado: EstadoPC = r < 5 ? "DISPONIBLE" : r < 9 ? "EN_USO" : "MANTENIMIENTO";
      pcs.push({
        idComputadora: id,
        idLaboratorio: lab,
        estado,
        usuarioActual: estado === "EN_USO" ? CODIGOS[(id * 3 + lab) % CODIGOS.length] : undefined,
        minutosUsoHoy: (id * 23 + n * 17) % 480,
        inicioSesion: estado === "EN_USO"
          ? new Date(Date.now() - ((id * 7 + n * 13) % 90) * 60_000)
          : undefined,
      });
      id++;
    }
  }
  return pcs;
}

/** Genera 100 registros históricos en los últimos 30 días (08:00–20:00 hrs). */
function generarRegistros(): RegistroUso[] {
  const registros: RegistroUso[] = [];
  const ahora = new Date();
  for (let i = 1; i <= 100; i++) {
    const dias = (i * 7 + 3) % 30;
    const hora = 8 + (i * 3 + 1) % 12;
    const min  = (i * 17) % 60;
    const dur  = 30 + (i * 11) % 90;
    const inicio = new Date(ahora);
    inicio.setDate(inicio.getDate() - dias);
    inicio.setHours(hora, min, 0, 0);
    const fin = new Date(inicio.getTime() + dur * 60_000);
    const labId = (i % 4) + 1;
    registros.push({
      idRegistro: i,
      codigoEstudiante: CODIGOS[(i * 3 + 1) % CODIGOS.length],
      idComputadora: (labId - 1) * 20 + 1 + (i % 20),
      idLaboratorio: labId,
      horaInicio: inicio,
      horaFin: fin,
      minutosTotales: dur,
    });
  }
  return registros;
}

const COMPUTADORAS = generarComputadoras();
const REGISTROS    = generarRegistros();

// ─────────────────────────────────────────────────────────────────────────────
// 3. SERVICIOS
// ─────────────────────────────────────────────────────────────────────────────

const authService = {
  /** Devuelve el usuario si las credenciales coinciden, o null si no. */
  login: (u: string, p: string): UsuarioWeb | null =>
    USUARIOS.find(x => x.username === u && x.password === p) ?? null,
};

const estadisticasService = {
  getLaboratorioPorId: (id: number) => LABORATORIOS.find(l => l.id === id),
  getPcsPorLab: (id: number) => COMPUTADORAS.filter(c => c.idLaboratorio === id),
  getHistorial: (cod: string) =>
    REGISTROS.filter(r => r.codigoEstudiante === cod)
      .sort((a, b) => b.horaInicio.getTime() - a.horaInicio.getTime()),

  /**
   * Devuelve los últimos `limite` usos de una PC específica,
   * ordenados del más reciente al más antiguo.
   * Usado en las tarjetas del grid del Encargado para mostrar
   * quiénes han utilizado ese equipo.
   */
  getHistorialPorPc: (idPc: number, limite = 3): RegistroUso[] =>
    REGISTROS.filter(r => r.idComputadora === idPc)
      .sort((a, b) => b.horaInicio.getTime() - a.horaInicio.getTime())
      .slice(0, limite),

  /**
   * Construye un Map de idComputadora → RegistroUso[] para todas las PCs
   * de un laboratorio. Se llama una vez y evita iterar REGISTROS 20 veces.
   */
  getHistorialPorLabMap: (idLab: number): Map<number, RegistroUso[]> => {
    const map = new Map<number, RegistroUso[]>();
    const regs = REGISTROS
      .filter(r => r.idLaboratorio === idLab)
      .sort((a, b) => b.horaInicio.getTime() - a.horaInicio.getTime());
    regs.forEach(r => {
      const lista = map.get(r.idComputadora) ?? [];
      if (lista.length < 3) lista.push(r);   // guarda solo los 3 más recientes por PC
      map.set(r.idComputadora, lista);
    });
    return map;
  },

  /**
   * Devuelve los registros de una fecha y laboratorio dados.
   * idLab = 0 significa "todos los laboratorios".
   * La fecha se compara solo por día (ignora la hora).
   */
  getReportePorFechaYLab(fecha: Date, idLab: number): RegistroUso[] {
    const dia = fecha.toDateString();
    return REGISTROS.filter(r => {
      const mismoDia = r.horaInicio.toDateString() === dia;
      const mismoLab = idLab === 0 || r.idLaboratorio === idLab;
      return mismoDia && mismoLab;
    }).sort((a, b) => a.horaInicio.getTime() - b.horaInicio.getTime());
  },

  /** Devuelve todas las fechas únicas con registros, para poblar el selector de fechas. */
  getFechasDisponibles(): Date[] {
    const vistas = new Set<string>();
    const fechas: Date[] = [];
    REGISTROS.forEach(r => {
      const key = r.horaInicio.toDateString();
      if (!vistas.has(key)) { vistas.add(key); fechas.push(new Date(r.horaInicio)); }
    });
    return fechas.sort((a, b) => b.getTime() - a.getTime()); // más reciente primero
  },

  /** Calcula KPIs, datos de gráficas y afluencia horaria para el Director. */
  getGenerales() {
    const hoy     = new Date().toDateString();
    const hoyRegs = REGISTROS.filter(r => r.horaInicio.toDateString() === hoy);
    const alumnosHoy = Math.max(new Set(hoyRegs.map(r => r.codigoEstudiante)).size, 7);
    const pcMax   = [...COMPUTADORAS].sort((a, b) => b.minutosUsoHoy - a.minutosUsoHoy)[0];
    const conteo  = new Map<number, number>();
    REGISTROS.forEach(r => conteo.set(r.idLaboratorio, (conteo.get(r.idLaboratorio) ?? 0) + 1));
    const [topLabId, topCount] = [...conteo.entries()].sort((a, b) => b[1] - a[1])[0];
    const horasPorLab = LABORATORIOS.map(lab => ({
      nombre: lab.nombre.replace("Lab. ", ""),
      horas: Math.round(REGISTROS.filter(r => r.idLaboratorio === lab.id).reduce((s, r) => s + r.minutosTotales, 0) / 60),
    }));
    const afluencia = Array.from({ length: 13 }, (_, i) => {
      const h = i + 8;
      return { hora: `${String(h).padStart(2, "0")}:00`, cantidad: REGISTROS.filter(r => r.horaInicio.getHours() === h).length };
    });
    return { alumnosHoy, pcMax, topLabId, topCount, horasPorLab, afluencia };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. EXPORTACIÓN — PDF y Excel
// Las funciones son asíncronas para cargar las librerías solo cuando se necesitan
// (dynamic import), evitando aumentar el bundle inicial de la app.
// ─────────────────────────────────────────────────────────────────────────────

/** Fila normalizada del informe. Usada tanto en la vista previa como en los exports. */
interface FilaReporte {
  codigo:      string;  // código del estudiante
  laboratorio: string;  // nombre del laboratorio
  pc:          string;  // "PC-42"
  inicio:      string;  // "dd/mm/aa HH:mm"
  fin:         string;  // "dd/mm/aa HH:mm"
  minutos:     number;  // duración en minutos
  horas:       string;  // "1h 30m" — legible para humanos
}

/** Convierte minutos a "Xh Ym". Ej: 90 → "1h 30m" */
const fmtDuracion = (min: number): string => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

/** Formatea Date → "dd/mm/aaaa HH:mm" para los informes exportados. */
const fmtInforme = (d: Date): string =>
  d.toLocaleDateString("es-MX", { day: "2-digit", month: "2-digit", year: "numeric" }) +
  " " +
  d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });

/**
 * Construye las filas del informe a partir de los registros filtrados.
 * Se usa tanto para la vista previa como para los exportadores.
 */
function construirFilas(registros: RegistroUso[]): FilaReporte[] {
  return registros.map(r => ({
    codigo:      r.codigoEstudiante,
    laboratorio: LABORATORIOS.find(l => l.id === r.idLaboratorio)?.nombre ?? `Lab ${r.idLaboratorio}`,
    pc:          `PC-${r.idComputadora}`,
    inicio:      fmtInforme(r.horaInicio),
    fin:         fmtInforme(r.horaFin),
    minutos:     r.minutosTotales,
    horas:       fmtDuracion(r.minutosTotales),
  }));
}

/**
 * exportarExcel — Genera y descarga un archivo .xlsx con los datos del informe.
 * Usa SheetJS (xlsx) cargado dinámicamente.
 */
async function exportarExcel(filas: FilaReporte[], titulo: string): Promise<void> {
  const XLSX = await import("xlsx");

  // Cabeceras en español para el archivo
  const cabeceras = ["Código Estudiantil", "Laboratorio", "PC", "Hora Inicio", "Hora Fin", "Minutos", "Duración"];

  // Convierte FilaReporte[] en array de arrays para SheetJS
  const cuerpo = filas.map(f => [f.codigo, f.laboratorio, f.pc, f.inicio, f.fin, f.minutos, f.horas]);

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([cabeceras, ...cuerpo]);

  // Ajusta el ancho de cada columna al contenido más largo
  ws["!cols"] = [16, 22, 8, 18, 18, 10, 10].map(w => ({ wch: w }));

  XLSX.utils.book_append_sheet(wb, ws, "Informe");
  XLSX.writeFile(wb, `${titulo}.xlsx`);
}

/**
 * exportarPDF — Genera y descarga un archivo .pdf con tabla y resumen.
 * Usa jsPDF + jspdf-autotable cargados dinámicamente.
 */
async function exportarPDF(filas: FilaReporte[], titulo: string, subtitulo: string): Promise<void> {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF({ orientation: "landscape" });

  // Encabezado del documento
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("LabControl — Informe de Uso de Laboratorios", 14, 16);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(120);
  doc.text(subtitulo, 14, 23);

  // Línea divisora
  doc.setDrawColor(200);
  doc.line(14, 26, 283, 26);

  // Resumen rápido encima de la tabla
  const totalAlumnos = new Set(filas.map(f => f.codigo)).size;
  const totalMin     = filas.reduce((s, f) => s + f.minutos, 0);
  doc.setTextColor(40);
  doc.setFontSize(8);
  doc.text(
    `Estudiantes únicos: ${totalAlumnos}   |   Sesiones: ${filas.length}   |   Total: ${fmtDuracion(totalMin)}`,
    14, 32
  );

  // Tabla principal
  autoTable(doc, {
    startY: 36,
    head: [["Código", "Laboratorio", "PC", "Hora Inicio", "Hora Fin", "Duración"]],
    body: filas.map(f => [f.codigo, f.laboratorio, f.pc, f.inicio, f.fin, f.horas]),
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [17, 17, 17], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 248, 248] },
    columnStyles: {
      0: { cellWidth: 30 },  // código
      1: { cellWidth: 50 },  // laboratorio
      2: { cellWidth: 18 },  // PC
      3: { cellWidth: 38 },  // inicio
      4: { cellWidth: 38 },  // fin
      5: { cellWidth: 22 },  // duración
    },
  });

  doc.save(`${titulo}.pdf`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 4B. EXPORT DE CLASES — Historial de sesiones para el Director
// ─────────────────────────────────────────────────────────────────────────────

/** Exporta historial de clases a .xlsx (dos hojas: resumen + detalle). */
async function exportarClasesExcel(clases: ClaseRegistro[]): Promise<void> {
  const XLSX = await import("xlsx");
  const wb   = XLSX.utils.book_new();

  const cab1 = ["#","Docente","Laboratorio","Curso","Código","Fecha","Inicio","Fin","Duración","Equipos","Alumnos"];
  const rows1 = clases.map((c, i) => [
    i + 1, c.docenteNombre, c.nombreLaboratorio, c.nombreCurso, c.codigoCurso,
    c.fecha.toLocaleDateString("es-MX"),
    c.horaInicio.toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"}),
    c.horaFin?.toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"}) ?? "—",
    c.duracionMinutos ? fmtDuracion(c.duracionMinutos) : "—",
    c.maquinas.length,
    new Set(c.maquinas.map(m => m.codigoUsuario)).size,
  ]);
  const ws1 = XLSX.utils.aoa_to_sheet([cab1, ...rows1]);
  ws1["!cols"] = [4,22,22,30,10,12,8,8,10,10,10].map(w => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws1, "Clases");

  const cab2 = ["Clase #","Docente","Laboratorio","Curso","PC","Estudiante","Código","Hora Conexión","Minutos"];
  const rows2: (string | number)[][] = [];
  clases.forEach((c, ci) => {
    c.maquinas.forEach(m => rows2.push([
      ci + 1, c.docenteNombre, c.nombreLaboratorio, c.nombreCurso,
      `PC-${m.idComputadora}`, m.usuarioNombre ?? "—", m.codigoUsuario ?? "—",
      m.horaConexion?.toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"}) ?? "—",
      m.minutos ?? 0,
    ]));
  });
  const ws2 = XLSX.utils.aoa_to_sheet([cab2, ...rows2]);
  ws2["!cols"] = [6,22,22,30,8,20,12,14,10].map(w => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws2, "Detalle Máquinas");
  XLSX.writeFile(wb, `historial_clases_${new Date().toISOString().split("T")[0]}.xlsx`);
}

/** Exporta historial de clases a .pdf. */
async function exportarClasesPDF(clases: ClaseRegistro[]): Promise<void> {
  const { default: jsPDF }     = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ orientation: "landscape" });

  doc.setFontSize(14); doc.setFont("helvetica","bold");
  doc.text("LabControl — Historial de Clases", 14, 16);
  doc.setFontSize(9); doc.setFont("helvetica","normal"); doc.setTextColor(120);
  doc.text(`Generado el ${new Date().toLocaleDateString("es-MX",{day:"numeric",month:"long",year:"numeric"})} · ${clases.length} clases`, 14, 23);
  doc.setDrawColor(200); doc.line(14, 26, 283, 26);

  autoTable(doc, {
    startY: 30,
    head: [["#","Docente","Laboratorio","Curso","Fecha","Inicio","Fin","Duración","Equipos","Alumnos"]],
    body: clases.map((c, i) => [
      i+1, c.docenteNombre, c.nombreLaboratorio, c.nombreCurso,
      c.fecha.toLocaleDateString("es-MX"),
      c.horaInicio.toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"}),
      c.horaFin?.toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"}) ?? "—",
      c.duracionMinutos ? fmtDuracion(c.duracionMinutos) : "—",
      c.maquinas.length,
      new Set(c.maquinas.map(m => m.codigoUsuario)).size,
    ]),
    styles: { fontSize: 7.5, cellPadding: 2.5 },
    headStyles: { fillColor: [17,17,17], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248,248,248] },
    columnStyles: { 0:{cellWidth:8}, 1:{cellWidth:34}, 2:{cellWidth:36}, 3:{cellWidth:38} },
  });
  doc.save(`historial_clases_${new Date().toISOString().split("T")[0]}.pdf`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 4C. UTILIDADES
// ─────────────────────────────────────────────────────────────────────────────

/** Formatea Date → "dd/mm/aa HH:mm" */
const fmtDate = (d: Date) =>
  d.toLocaleDateString("es-MX", { day: "2-digit", month: "2-digit", year: "2-digit" }) + " " +
  d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });

/** Minutos transcurridos desde una fecha hasta ahora. */
const minsDesde = (d: Date) => Math.floor((Date.now() - d.getTime()) / 60_000);

/** "Ana Torres" → "AT" */
const iniciales = (n: string) => n.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();

// ─────────────────────────────────────────────────────────────────────────────
// 5. ICONOS (SVG inline, sin dependencias externas)
// ─────────────────────────────────────────────────────────────────────────────

const IcoUsers   = () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>;
const IcoCpu     = () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 002.25-2.25V6.75a2.25 2.25 0 00-2.25-2.25H6.75A2.25 2.25 0 004.5 6.75v10.5a2.25 2.25 0 002.25 2.25zm.75-12h9v9h-9v-9z" /></svg>;
const IcoTrend   = () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" /></svg>;
const IcoSearch  = () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803a7.5 7.5 0 0010.607 10.607z" /></svg>;
const IcoLogout  = () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" /></svg>;
const IcoMonitor = () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25A2.25 2.25 0 015.25 3h13.5A2.25 2.25 0 0121 5.25z" /></svg>;

// ─────────────────────────────────────────────────────────────────────────────
// 6. UI COMPARTIDA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ChartTooltip — Tooltip personalizado que Recharts inyecta sobre los gráficos.
 * Se renderiza solo cuando `active === true` (cursor encima de un punto o barra).
 */
function ChartTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ value: number; name: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className={[
        "bg-white",           // fondo blanco sólido para contrastar con el gráfico
        "border",             // borde de 1px
        "border-[#e5e5e5]",   // color de borde: gris claro
        "rounded-lg",         // esquinas redondeadas (8px)
        "px-3",               // padding horizontal 12px
        "py-2",               // padding vertical 8px
        "shadow-md",          // sombra media para sensación de flotación
        "text-xs",            // fuente pequeña (12px)
      ].join(" ")}
    >
      {/* Etiqueta del eje X */}
      <p
        className={[
          "text-[#888888]",   // color: gris medio, para diferenciar de los datos
          "mb-1",             // margen inferior 4px
        ].join(" ")}
        style={{ fontFamily: "DM Mono, monospace" }}
      >
        {label}
      </p>
      {/* Valor numérico principal */}
      <p
        className={[
          "text-[#111111]",   // color: casi negro, máximo contraste
          "font-semibold",    // peso 600
        ].join(" ")}
        style={{ fontFamily: "DM Mono, monospace" }}
      >
        {payload[0].value} {payload[0].name === "cantidad" ? "registros" : "hrs"}
      </p>
    </div>
  );
}

/**
 * KpiCard — Tarjeta de métrica clave reutilizable.
 * Usada en el panel del Director para los 3 indicadores superiores.
 *
 * @param label  Nombre de la métrica (ej. "Alumnos únicos hoy")
 * @param value  Valor grande principal (ej. "12" o "PC-34")
 * @param sub    Contexto adicional bajo el valor
 * @param icon   Componente SVG representativo
 * @param dot    Clase Tailwind del punto de color (bg-black, bg-amber-500, bg-green-500)
 */
function KpiCard({ label, value, sub, icon, dot }: {
  label: string; value: string; sub: string;
  icon: React.ReactNode; dot: string;
}) {
  return (
    <div
      className={[
        "bg-card",              // fondo de tarjeta (blanco, del tema)
        "border",               // borde 1px
        "border-border",        // color del borde del tema (#e5e5e5)
        "rounded-xl",           // esquinas redondeadas grandes (12px)
        "p-6",                  // padding 24px en todos los lados
        "hover:border-[#aaaaaa]",// al pasar el cursor, borde más oscuro
        "transition-colors",    // anima el cambio de color del borde
      ].join(" ")}
    >
      {/* Fila superior: icono + punto de color */}
      <div
        className={[
          "flex",             // fila horizontal
          "items-start",      // alinea hijos al tope
          "justify-between",  // separa icono y punto a los extremos
          "mb-5",             // margen inferior 20px
        ].join(" ")}
      >
        {/* Contenedor del icono: fondo gris suave */}
        <div
          className={[
            "w-9",            // ancho 36px
            "h-9",            // alto 36px
            "rounded-lg",     // esquinas redondeadas (8px)
            "bg-secondary",   // fondo: gris muy claro (#f5f5f5)
            "flex",           // centra el SVG
            "items-center",   // centrado vertical
            "justify-center", // centrado horizontal
            "text-foreground",// color del icono: negro
          ].join(" ")}
        >
          {icon}
        </div>
        {/* Punto de color semántico — diferencia visualmente cada KPI */}
        <span className={["w-2", "h-2", "rounded-full", "mt-1", dot].join(" ")} />
      </div>

      {/* Valor numérico o textual principal */}
      <p
        className={[
          "text-3xl",         // fuente grande (30px)
          "font-bold",        // peso 700
          "text-foreground",  // color: negro (#111111)
          "leading-none",     // interlineado sin espacio extra
        ].join(" ")}
        style={{ fontFamily: "DM Mono, monospace" }}
      >
        {value}
      </p>

      {/* Etiqueta de la métrica en mayúsculas */}
      <p
        className={[
          "text-[10px]",         // fuente muy pequeña (10px)
          "text-muted-foreground",// color: gris (#888888)
          "uppercase",            // todo en mayúsculas
          "tracking-widest",      // espaciado de letras máximo
          "mt-2",                 // margen superior 8px
        ].join(" ")}
        style={{ fontFamily: "DM Mono, monospace" }}
      >
        {label}
      </p>

      {/* Subtexto de contexto */}
      <p
        className={[
          "text-muted-foreground", // color: gris (#888888)
          "text-xs",               // fuente 12px
          "mt-1",                  // margen superior 4px
        ].join(" ")}
      >
        {sub}
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 7A. VISTA DE LOGIN
// ─────────────────────────────────────────────────────────────────────────────

/**
 * LoginView — Primera pantalla. Muestra el formulario de autenticación.
 * onLogin() se llama cuando las credenciales son correctas.
 */
function LoginView({ onLogin }: { onLogin: (u: UsuarioWeb) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    setTimeout(() => {
      const user = authService.login(username, password);
      setLoading(false);
      if (user) onLogin(user);
      else setError("Usuario o contraseña incorrectos.");
    }, 350);
  };

  const ACCESOS = [
    ["director",   "director123"],
    ["docente1",   "doc1pass"],
    ["docente2",   "doc2pass"],
    ["encargado1", "lab1pass"],
  ];

  return (
    <div
      className={[
        "min-h-screen",       // ocupa al menos la altura total de la ventana
        "bg-background",      // fondo del tema (blanco #ffffff)
        "flex",               // flexbox para centrar el contenido
        "items-center",       // centra verticalmente
        "justify-center",     // centra horizontalmente
        "p-4",                // padding 16px (evita que el card toque los bordes en móvil)
      ].join(" ")}
    >
      {/* ── Columna central ── */}
      <div
        className={[
          "w-full",      // ocupa todo el ancho disponible
          "max-w-sm",    // pero no más de 384px (tamaño de formulario estándar)
        ].join(" ")}
      >

        {/* ── Cabecera: logo + nombre ── */}
        <div
          className={[
            "text-center", // centra el logo y el texto
            "mb-8",        // margen inferior 32px antes de la tarjeta
          ].join(" ")}
        >
          {/* Logo: cuadrado negro con icono blanco */}
          <div
            className={[
              "inline-flex",      // bloque inline para centrar con text-center
              "items-center",     // centra el SVG verticalmente
              "justify-center",   // centra el SVG horizontalmente
              "w-12",             // ancho 48px
              "h-12",             // alto 48px
              "rounded-xl",       // esquinas redondeadas grandes (12px)
              "bg-foreground",    // fondo negro (#111111)
              "mb-4",             // margen inferior 16px
            ].join(" ")}
          >
            <svg className="w-6 h-6 text-background" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25A2.25 2.25 0 015.25 3h13.5A2.25 2.25 0 0121 5.25z" />
            </svg>
          </div>

          {/* Nombre de la aplicación */}
          <h1
            className={[
              "text-xl",          // fuente 20px
              "font-semibold",    // peso 600
              "text-foreground",  // color negro
            ].join(" ")}
          >
            LabControl
          </h1>

          {/* Subtítulo descriptivo */}
          <p
            className={[
              "text-muted-foreground", // color gris (#888888)
              "text-sm",               // fuente 14px
              "mt-1",                  // margen superior 4px
            ].join(" ")}
          >
            Sistema de Analítica en Tiempo Real
          </p>
        </div>

        {/* ── Tarjeta del formulario ── */}
        <div
          className={[
            "bg-card",       // fondo blanco (del tema)
            "border",        // borde 1px
            "border-border", // color del borde gris claro
            "rounded-xl",    // esquinas redondeadas 12px
            "p-6",           // padding 24px
          ].join(" ")}
        >

          {/* Alerta de error — solo visible cuando error !== "" */}
          {error && (
            <div
              className={[
                "border",          // borde 1px
                "border-red-200",  // borde rojo claro
                "bg-red-50",       // fondo rojo muy suave
                "text-red-700",    // texto rojo oscuro (buena legibilidad)
                "rounded-lg",      // esquinas redondeadas 8px
                "px-4",            // padding horizontal 16px
                "py-3",            // padding vertical 12px
                "mb-5",            // margen inferior 20px (separa del formulario)
                "text-sm",         // fuente 14px
              ].join(" ")}
            >
              {error}
            </div>
          )}

          <form onSubmit={submit} className="space-y-4">
            {/* ── Campo: Usuario ── */}
            <div>
              <label
                className={[
                  "block",              // elemento de bloque (ocupa su propia línea)
                  "text-xs",            // fuente muy pequeña 12px
                  "font-medium",        // peso 500
                  "text-muted-foreground",// color gris
                  "mb-1.5",             // margen inferior 6px
                  "uppercase",          // todo en mayúsculas
                  "tracking-wider",     // espaciado de letras amplio
                ].join(" ")}
              >
                Usuario
              </label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="director / encargado1..."
                required
                style={{ fontFamily: "DM Mono, monospace" }}
                className={[
                  "w-full",                      // ocupa todo el ancho del contenedor
                  "bg-secondary",                // fondo gris muy claro (#f5f5f5)
                  "border",                      // borde 1px
                  "border-border",               // color gris claro
                  "text-foreground",             // texto negro
                  "rounded-lg",                  // esquinas redondeadas 8px
                  "px-3.5",                      // padding horizontal 14px
                  "py-2.5",                      // padding vertical 10px
                  "placeholder:text-muted-foreground/40", // placeholder gris muy suave
                  "focus:outline-none",          // elimina el outline azul del navegador
                  "focus:border-foreground",     // al enfocar, borde negro
                  "transition-colors",           // anima el cambio de color del borde
                  "text-sm",                     // fuente 14px
                ].join(" ")}
              />
            </div>

            {/* ── Campo: Contraseña ── */}
            <div>
              <label
                className={[
                  "block",
                  "text-xs",
                  "font-medium",
                  "text-muted-foreground",
                  "mb-1.5",
                  "uppercase",
                  "tracking-wider",
                ].join(" ")}
              >
                Contraseña
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className={[
                  "w-full",
                  "bg-secondary",
                  "border",
                  "border-border",
                  "text-foreground",
                  "rounded-lg",
                  "px-3.5",
                  "py-2.5",
                  "placeholder:text-muted-foreground/40",
                  "focus:outline-none",
                  "focus:border-foreground",
                  "transition-colors",
                  "text-sm",
                ].join(" ")}
              />
            </div>

            {/* ── Botón de envío ── */}
            <button
              type="submit"
              disabled={loading}
              className={[
                "w-full",             // ocupa todo el ancho
                "bg-foreground",      // fondo negro (#111111)
                "text-background",    // texto blanco (contraste máximo)
                "hover:bg-[#333333]", // al pasar cursor, negro más suave
                "disabled:opacity-50",// si está deshabilitado, semitransparente
                "font-medium",        // peso 500
                "py-2.5",             // padding vertical 10px
                "rounded-lg",         // esquinas redondeadas 8px
                "transition-colors",  // anima el cambio de fondo
                "text-sm",            // fuente 14px
              ].join(" ")}
            >
              {loading ? "Verificando..." : "Ingresar"}
            </button>
          </form>

          {/* ── Accesos rápidos de demo ── */}
          <div
            className={[
              "mt-5",          // margen superior 20px
              "pt-5",          // padding superior 20px (empuja el contenido hacia abajo)
              "border-t",      // línea divisora superior
              "border-border", // color del divisor gris claro
            ].join(" ")}
          >
            <p
              className={[
                "text-[10px]",           // fuente 10px (muy pequeña, secundaria)
                "text-muted-foreground", // color gris
                "uppercase",             // en mayúsculas
                "tracking-widest",       // espaciado máximo de letras
                "mb-3",                  // margen inferior 12px
              ].join(" ")}
              style={{ fontFamily: "DM Mono, monospace" }}
            >
              Acceso rápido (demo)
            </p>

            {/* Grid 2×2 de botones de auto-relleno */}
            <div
              className={[
                "grid",          // rejilla CSS Grid
                "grid-cols-2",   // 2 columnas de igual ancho
                "gap-1.5",       // espacio de 6px entre celdas
              ].join(" ")}
            >
              {ACCESOS.map(([u, p]) => (
                <button
                  key={u}
                  onClick={() => { setUsername(u); setPassword(p); }}
                  className={[
                    "text-left",         // alinea el texto a la izquierda
                    "px-3",              // padding horizontal 12px
                    "py-2",              // padding vertical 8px
                    "rounded-lg",        // esquinas redondeadas 8px
                    "bg-secondary",      // fondo gris muy claro
                    "hover:bg-accent",   // al pasar cursor, gris ligeramente más oscuro
                    "border",            // borde 1px
                    "border-border",     // color gris claro
                    "hover:border-[#cccccc]", // al hover, borde más visible
                    "transition-all",    // anima todos los cambios
                  ].join(" ")}
                >
                  {/* Nombre de usuario — en mono para claridad */}
                  <span
                    className={["text-foreground", "text-[11px]", "font-medium", "block"].join(" ")}
                    style={{ fontFamily: "DM Mono, monospace" }}
                  >
                    {u}
                  </span>
                  {/* Contraseña — gris para distinguirla del usuario */}
                  <span
                    className={["text-muted-foreground", "text-[10px]"].join(" ")}
                    style={{ fontFamily: "DM Mono, monospace" }}
                  >
                    {p}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 7B. SIDEBAR
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sidebar — Barra lateral fija con logo, navegación activa,
 * estado del sistema y datos del usuario autenticado.
 */
function Sidebar({ usuario, onLogout, apiOnline }: { usuario: UsuarioWeb; onLogout: () => void; apiOnline: boolean }) {
  return (
    <aside
      className={[
        "w-56",           // ancho fijo de 224px
        "bg-[#fafafa]",   // fondo blanco roto (ligeramente más oscuro que la página)
        "border-r",       // línea divisora a la derecha
        "border-border",  // color del divisor gris claro
        "flex",           // flexbox en columna para apilar secciones
        "flex-col",       // dirección vertical
        "h-screen",       // ocupa toda la altura de la ventana
        "sticky",         // queda fija al hacer scroll en el contenido principal
        "top-0",          // pegada al borde superior
        "shrink-0",       // no se encoge aunque el contenido sea grande
      ].join(" ")}
    >

      {/* ── Logo ── */}
      <div
        className={[
          "px-5",          // padding horizontal 20px
          "py-5",          // padding vertical 20px
          "border-b",      // línea divisora inferior
          "border-border", // color gris claro
        ].join(" ")}
      >
        <div
          className={[
            "flex",        // fila horizontal
            "items-center",// centra verticalmente el cuadro y el texto
            "gap-2.5",     // espacio de 10px entre logo y texto
          ].join(" ")}
        >
          {/* Cuadro negro con ícono blanco */}
          <div
            className={[
              "w-7",            // ancho 28px
              "h-7",            // alto 28px
              "bg-foreground",  // fondo negro
              "rounded-lg",     // esquinas redondeadas 8px
              "flex",           // centra el SVG
              "items-center",
              "justify-center",
              "shrink-0",       // no se encoge al comprimir la barra
            ].join(" ")}
          >
            <svg className="w-3.5 h-3.5 text-background" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25A2.25 2.25 0 015.25 3h13.5A2.25 2.25 0 0121 5.25z" />
            </svg>
          </div>
          <div>
            <p className={["text-foreground", "font-semibold", "text-sm"].join(" ")}>LabControl</p>
            <p
              className={["text-muted-foreground", "text-[10px]"].join(" ")}
              style={{ fontFamily: "DM Mono, monospace" }}
            >
              v2.0
            </p>
          </div>
        </div>
      </div>

      {/* ── Navegación activa ── */}
      <nav
        className={[
          "flex-1", // ocupa el espacio sobrante entre el logo y el footer
          "p-3",    // padding 12px
        ].join(" ")}
      >
        {/* Ítem activo: fondo negro, texto blanco. Solo un destino por rol. */}
        <div
          className={[
            "flex",           // fila horizontal
            "items-center",   // centra icono y texto verticalmente
            "gap-2.5",        // espacio 10px entre icono y texto
            "px-3",           // padding horizontal 12px
            "py-2.5",         // padding vertical 10px
            "rounded-lg",     // esquinas redondeadas 8px
            "bg-foreground",  // fondo negro (estado activo)
            "text-background",// texto blanco
            "text-xs",        // fuente 12px
            "font-medium",    // peso 500
          ].join(" ")}
        >
          {usuario.rol === "DIRECTOR"  && <><IcoTrend />   Panel Director</>}
          {usuario.rol === "ENCARGADO" && <><IcoMonitor /> Mi Laboratorio</>}
          {usuario.rol === "DOCENTE"   && (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5" />
              </svg>
              Panel Docente
            </>
          )}
        </div>
        <div className="mx-3 mt-1.5">
          <span className={[
            "text-[9px] font-medium uppercase tracking-widest px-2 py-0.5 rounded-full",
            usuario.rol === "DOCENTE"   ? "bg-blue-100 text-blue-700" :
            usuario.rol === "DIRECTOR"  ? "bg-foreground/8 text-muted-foreground" :
                                          "bg-green-100 text-green-700",
          ].join(" ")}>
            {usuario.rol}
          </span>
        </div>
      </nav>

      {/* ── Indicador de estado del sistema ── */}
      <div
        className={[
          "px-3", // padding horizontal 12px
          "pb-3", // padding inferior 12px
        ].join(" ")}
      >
        {/* Indicador de estado: muestra si Supabase está conectado */}
        <div
          className={[
            "flex",
            "items-center",
            "gap-2",
            "px-3",
            "py-2",
            "rounded-lg",
            apiOnline ? "bg-green-50 border border-green-100" : "bg-secondary border border-border",
          ].join(" ")}
        >
          <span
            className={[
              "w-1.5", "h-1.5", "rounded-full", "shrink-0",
              apiOnline ? "bg-green-500 animate-pulse" : "bg-[#cccccc]",
            ].join(" ")}
          />
          <span
            className={[apiOnline ? "text-green-700" : "text-muted-foreground", "text-[10px]"].join(" ")}
            style={{ fontFamily: "DM Mono, monospace" }}
          >
            {apiOnline ? "Supabase" : "Sin conexión"}
          </span>
        </div>
      </div>

      {/* ── Sección de usuario y logout ── */}
      <div
        className={[
          "p-3",           // padding 12px
          "border-t",      // línea divisora superior
          "border-border", // color gris claro
        ].join(" ")}
      >
        {/* Fila avatar + nombre + rol */}
        <div
          className={[
            "flex",        // fila horizontal
            "items-center",// centra avatar y texto
            "gap-2.5",     // espacio 10px
            "px-3",        // padding horizontal 12px
            "py-2",        // padding vertical 8px
            "mb-1",        // margen inferior 4px
          ].join(" ")}
        >
          {/* Avatar circular con iniciales generadas del nombre */}
          <div
            className={[
              "w-7",             // diámetro 28px
              "h-7",             // diámetro 28px
              "rounded-full",    // círculo perfecto
              "bg-foreground",   // fondo negro
              "flex",            // centra las iniciales
              "items-center",
              "justify-center",
              "text-background", // texto blanco
              "text-[10px]",     // fuente 10px
              "font-bold",       // peso 700 para que las iniciales sean legibles
              "shrink-0",        // no se encoge
            ].join(" ")}
          >
            {iniciales(usuario.nombre)}
          </div>
          <div className="overflow-hidden">
            <p
              className={[
                "text-foreground",
                "text-xs",
                "font-medium",
                "truncate",   // corta el texto con "..." si no cabe
              ].join(" ")}
            >
              {usuario.nombre}
            </p>
            <p
              className={["text-muted-foreground", "text-[10px]"].join(" ")}
              style={{ fontFamily: "DM Mono, monospace" }}
            >
              {usuario.rol}
            </p>
          </div>
        </div>

        {/* Botón cerrar sesión */}
        <button
          onClick={onLogout}
          className={[
            "w-full",              // ocupa todo el ancho de la sidebar
            "flex",                // fila horizontal
            "items-center",        // centra icono y texto
            "gap-2",               // espacio 8px
            "px-3",                // padding horizontal 12px
            "py-2",                // padding vertical 8px
            "text-muted-foreground",// texto gris por defecto
            "hover:text-red-600",  // rojo al pasar cursor (acción destructiva)
            "hover:bg-red-50",     // fondo rojo muy suave al hover
            "rounded-lg",          // esquinas redondeadas 8px
            "transition-all",      // anima todos los cambios
            "text-xs",             // fuente 12px
          ].join(" ")}
        >
          <IcoLogout />
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 7C. LAB PC GRID — Componente compartido entre Director y Encargado
// Muestra la cuadrícula de 20 PCs con historial de uso y el ranking del día.
// Recibe un labId y se auto-actualiza cada 30s (simula tiempo real).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * LabPcGrid — Grid de PCs + ranking de un laboratorio.
 *
 * Componente compartido: el Director lo usa con un selector de tabs (puede
 * ver cualquiera de los 4 labs), y el Encargado lo usa con su lab fijo.
 * Cuando `labId` cambia (Director cambia de tab), reinicia las PCs y el mapa.
 */
function LabPcGrid({ labId }: { labId: number }) {
  // Estado mutable de las 20 PCs — se reinicia cuando cambia el lab
  const [pcs, setPcs] = useState<Computadora[]>(() => estadisticasService.getPcsPorLab(labId));

  // Mapa precalculado id→historial; se recalcula solo cuando cambia el lab
  const historialPorPc = useMemo(
    () => estadisticasService.getHistorialPorLabMap(labId),
    [labId]
  );

  // Cuando el Director cambia de tab, reemplaza las PCs con las del nuevo lab
  useEffect(() => {
    setPcs(estadisticasService.getPcsPorLab(labId));
  }, [labId]);

  // Simula recepción de datos en tiempo real: +1 min a cada PC en uso
  useEffect(() => {
    const t = setInterval(() => {
      setPcs(prev => prev.map(pc =>
        pc.estado === "EN_USO" ? { ...pc, minutosUsoHoy: pc.minutosUsoHoy + 1 } : pc
      ));
    }, 30_000);
    return () => clearInterval(t);
  }, [labId]); // se reinicia el intervalo al cambiar de lab

  // Top 10 PCs por minutos — recalculado solo cuando pcs cambia
  const ranking = useMemo(
    () => [...pcs].sort((a, b) => b.minutosUsoHoy - a.minutosUsoHoy).slice(0, 10),
    [pcs]
  );
  const maxMin = Math.max(...pcs.map(c => c.minutosUsoHoy), 1);

  /** Clases visuales de cada tarjeta según su estado. */
  const pcCard = (estado: EstadoPC) => {
    if (estado === "EN_USO")        return { wrap: "bg-red-50 border-red-200",     header: "text-red-700",   badge: "bg-red-100 text-red-600" };
    if (estado === "MANTENIMIENTO") return { wrap: "bg-amber-50 border-amber-200", header: "text-amber-700", badge: "bg-amber-100 text-amber-600" };
    return                                 { wrap: "bg-white border-[#e5e5e5]",    header: "text-[#111111]", badge: "bg-[#f5f5f5] text-[#555555]" };
  };

  /** Formatea solo la hora: "14:30" */
  const fmtH = (d: Date) => d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
  /** Formatea día/mes corto: "12/06" */
  const fmtD = (d: Date) => d.toLocaleDateString("es-MX", { day: "2-digit", month: "2-digit" });

  return (
    <div className="space-y-5">

      {/* ── Cuadrícula de PCs ── */}
      <div
        className={[
          "grid",           // rejilla CSS Grid
          "grid-cols-2",    // 2 columnas en móvil
          "sm:grid-cols-3", // 3 columnas en tablet
          "lg:grid-cols-4", // 4 columnas en desktop
          "xl:grid-cols-5", // 5 columnas en pantallas anchas
          "gap-3",          // espacio 12px entre tarjetas
        ].join(" ")}
      >
        {pcs.map(pc => {
          const s    = pcCard(pc.estado);
          const usos = historialPorPc.get(pc.idComputadora) ?? [];
          return (
            <div
              key={pc.idComputadora}
              className={[
                s.wrap,           // fondo y borde según estado (verde/rojo/ámbar)
                "border",         // borde 1px
                "rounded-xl",     // esquinas redondeadas 12px
                "p-3",            // padding 12px
                "transition-colors",// anima cambios de estado
                "flex",           // columna vertical
                "flex-col",       // apila header · sesión · historial
                "gap-2",          // espacio 8px entre secciones
              ].join(" ")}
            >
              {/* Número de PC + badge de estado */}
              <div className={["flex", "items-center", "justify-between"].join(" ")}>
                <span
                  className={[s.header, "text-xs", "font-bold"].join(" ")}
                  style={{ fontFamily: "DM Mono, monospace" }}
                >
                  PC-{pc.idComputadora}
                </span>
                <span
                  className={[
                    s.badge,         // colores del badge según estado
                    "text-[9px]",    // fuente muy pequeña
                    "font-medium",   // peso 500
                    "uppercase",     // en mayúsculas
                    "tracking-wide", // espaciado de letras
                    "px-1.5",        // padding horizontal 6px
                    "py-0.5",        // padding vertical 2px
                    "rounded",       // esquinas redondeadas leves
                  ].join(" ")}
                >
                  {pc.estado === "EN_USO" ? "En uso" : pc.estado === "MANTENIMIENTO" ? "Mtto." : "Libre"}
                </span>
              </div>

              {/* Bloque de sesión activa — visible solo cuando EN_USO */}
              {pc.estado === "EN_USO" && (
                <div
                  className={[
                    "bg-red-100/60", // fondo rojo muy sutil (60% opacidad)
                    "rounded-lg",    // esquinas redondeadas 8px
                    "px-2",          // padding horizontal 8px
                    "py-1.5",        // padding vertical 6px
                  ].join(" ")}
                >
                  <p className={["text-red-500", "text-[9px]", "uppercase", "tracking-wider", "mb-0.5"].join(" ")}>
                    Sesión activa
                  </p>
                  <p
                    className={["text-red-700", "text-xs", "font-semibold", "truncate"].join(" ")}
                    style={{ fontFamily: "DM Mono, monospace" }}
                  >
                    {pc.usuarioActual}
                  </p>
                  <p
                    className={["text-red-400", "text-[10px]", "mt-0.5"].join(" ")}
                    style={{ fontFamily: "DM Mono, monospace" }}
                  >
                    {pc.inicioSesion ? minsDesde(pc.inicioSesion) : 0} min
                  </p>
                </div>
              )}

              {/* Historial de los 3 usos más recientes de esa PC */}
              <div
                className={[
                  "border-t",       // línea divisora superior
                  "border-black/5", // borde muy sutil
                  "pt-2",           // padding superior 8px
                ].join(" ")}
              >
                <p
                  className={[
                    "text-muted-foreground", // color gris
                    "text-[9px]",            // fuente 9px
                    "uppercase",             // en mayúsculas
                    "tracking-wider",        // espaciado de letras
                    "mb-1.5",                // margen inferior 6px
                  ].join(" ")}
                >
                  Últimos usos
                </p>
                {usos.length > 0 ? (
                  <ul className="space-y-1.5">
                    {usos.map(r => (
                      <li
                        key={`uso-${r.idRegistro}`}
                        className={["flex", "items-start", "justify-between", "gap-1"].join(" ")}
                      >
                        <div className="min-w-0">
                          {/* Código del estudiante que usó la PC */}
                          <p
                            className={["text-foreground", "text-[10px]", "font-medium", "truncate"].join(" ")}
                            style={{ fontFamily: "DM Mono, monospace" }}
                          >
                            {r.codigoEstudiante}
                          </p>
                          {/* Fecha y hora de esa sesión */}
                          <p
                            className={["text-muted-foreground", "text-[9px]"].join(" ")}
                            style={{ fontFamily: "DM Mono, monospace" }}
                          >
                            {fmtD(r.horaInicio)} {fmtH(r.horaInicio)}
                          </p>
                        </div>
                        {/* Duración de esa sesión */}
                        <span
                          className={["text-muted-foreground", "text-[9px]", "shrink-0", "mt-0.5"].join(" ")}
                          style={{ fontFamily: "DM Mono, monospace" }}
                        >
                          {r.minutosTotales}m
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={["text-muted-foreground/50", "text-[9px]", "italic"].join(" ")}>
                    Sin usos registrados
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Ranking de PCs del laboratorio ── */}
      <div
        className={[
          "bg-card",       // fondo blanco
          "border",        // borde 1px
          "border-border", // color gris claro
          "rounded-xl",    // esquinas redondeadas 12px
          "p-5",           // padding 20px
        ].join(" ")}
      >
        <h3 className={["text-foreground", "font-medium", "text-sm", "mb-4"].join(" ")}>
          Ranking de uso — Hoy
        </h3>
        <div className="space-y-3">
          {ranking.map((pc, i) => (
            <div key={`rank-${pc.idComputadora}`} className={["flex", "items-center", "gap-4"].join(" ")}>
              <span
                className={["text-muted-foreground", "text-[10px]", "w-4", "text-right", "shrink-0"].join(" ")}
                style={{ fontFamily: "DM Mono, monospace" }}
              >
                {i + 1}
              </span>
              <span
                className={["text-foreground", "text-xs", "font-medium", "w-14", "shrink-0"].join(" ")}
                style={{ fontFamily: "DM Mono, monospace" }}
              >
                PC-{pc.idComputadora}
              </span>
              <div
                className={[
                  "flex-1",       // ocupa el espacio disponible
                  "bg-secondary", // pista gris claro
                  "rounded-full", // extremos redondeados
                  "h-1.5",        // altura 6px
                  "overflow-hidden",// la barra no sobresale
                ].join(" ")}
              >
                <div
                  className={["h-full", "rounded-full", "bg-foreground", "transition-all", "duration-700"].join(" ")}
                  style={{ width: `${(pc.minutosUsoHoy / maxMin) * 100}%` }}
                />
              </div>
              <span
                className={["text-muted-foreground", "text-[10px]", "w-16", "text-right", "shrink-0"].join(" ")}
                style={{ fontFamily: "DM Mono, monospace" }}
              >
                {pc.minutosUsoHoy} min
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 7D. EXPORT PANEL
// Permite al Director filtrar por fecha y laboratorio, previsualizar los datos
// y descargar el informe en PDF o Excel con un solo clic.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * IcoDownload — Ícono de descarga para los botones de exportación.
 */
const IcoDownload = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
  </svg>
);

/**
 * ExportPanel — Generador de informes exportables.
 *
 * Flujo del usuario:
 *   1. Selecciona una fecha del selector (poblado con fechas que tienen datos).
 *   2. Selecciona un laboratorio (o "Todos").
 *   3. Ve una tabla de previsualización con los registros filtrados.
 *   4. Hace clic en "Excel" o "PDF" para descargar el archivo.
 *
 * Los exports son async: cargan xlsx/jspdf solo cuando se necesitan (lazy import).
 */
function ExportPanel() {
  // Fechas que tienen al menos un registro — para el selector de fecha
  const fechasDisponibles = useMemo(() => estadisticasService.getFechasDisponibles(), []);

  // Estado del filtro — por defecto la fecha más reciente y todos los labs
  const [fechaStr, setFechaStr] = useState<string>(() => {
    const f = fechasDisponibles[0];
    return f ? f.toISOString().split("T")[0] : new Date().toISOString().split("T")[0];
  });
  const [idLab,     setIdLab]     = useState<number>(0); // 0 = todos
  const [cargando,  setCargando]  = useState<"" | "pdf" | "excel">("");

  /** Registros filtrados según el selector actual */
  const registros = useMemo(() => {
    const fecha = new Date(fechaStr + "T12:00:00"); // mediodía evita problemas de zona horaria
    return estadisticasService.getReportePorFechaYLab(fecha, idLab);
  }, [fechaStr, idLab]);

  /** Filas del informe construidas a partir de los registros */
  const filas = useMemo(() => construirFilas(registros), [registros]);

  /** Resumen calculado de las filas actuales */
  const resumen = useMemo(() => ({
    alumnos:   new Set(filas.map(f => f.codigo)).size,
    sesiones:  filas.length,
    totalMins: filas.reduce((s, f) => s + f.minutos, 0),
    labNombre: idLab === 0 ? "Todos los laboratorios" : (LABORATORIOS.find(l => l.id === idLab)?.nombre ?? ""),
  }), [filas, idLab]);

  /** Nombre de archivo base para los exports */
  const nombreArchivo = `informe_${fechaStr}_${idLab === 0 ? "todos" : `lab${idLab}`}`;

  /** Subtítulo legible para el PDF */
  const subtitulo = `Fecha: ${new Date(fechaStr + "T12:00:00").toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })} · ${resumen.labNombre}`;

  const handleExcel = async () => {
    if (!filas.length) return;
    setCargando("excel");
    await exportarExcel(filas, nombreArchivo);
    setCargando("");
  };

  const handlePDF = async () => {
    if (!filas.length) return;
    setCargando("pdf");
    await exportarPDF(filas, nombreArchivo, subtitulo);
    setCargando("");
  };

  return (
    <div
      className={[
        "bg-card",       // fondo blanco
        "border",        // borde 1px
        "border-border", // color gris claro
        "rounded-xl",    // esquinas redondeadas 12px
        "p-6",           // padding 24px
      ].join(" ")}
    >
      {/* ── Encabezado ── */}
      <div className={["flex", "items-start", "justify-between", "mb-6"].join(" ")}>
        <div>
          <h2 className={["text-foreground", "font-medium", "text-sm"].join(" ")}>
            Exportar Informe
          </h2>
          <p
            className={["text-muted-foreground", "text-xs", "mt-0.5"].join(" ")}
            style={{ fontFamily: "DM Mono, monospace" }}
          >
            Selecciona fecha y laboratorio · descarga en PDF o Excel
          </p>
        </div>
        {/* Botones de exportación */}
        <div className={["flex", "gap-2"].join(" ")}>
          <button
            onClick={handleExcel}
            disabled={!filas.length || cargando !== ""}
            className={[
              "flex",           // fila horizontal
              "items-center",   // centra icono y texto
              "gap-1.5",        // espacio 6px entre icono y texto
              "px-4",           // padding horizontal 16px
              "py-2",           // padding vertical 8px
              "rounded-lg",     // esquinas redondeadas 8px
              "text-xs",        // fuente 12px
              "font-medium",    // peso 500
              "transition-all", // anima todos los cambios
              "border",         // borde 1px
              filas.length && cargando === ""
                ? "bg-[#16a34a] border-[#16a34a] text-white hover:bg-[#15803d]" // verde activo
                : "bg-secondary border-border text-muted-foreground cursor-not-allowed", // deshabilitado
            ].join(" ")}
          >
            <IcoDownload />
            {cargando === "excel" ? "Generando..." : "Excel"}
          </button>

          <button
            onClick={handlePDF}
            disabled={!filas.length || cargando !== ""}
            className={[
              "flex",
              "items-center",
              "gap-1.5",
              "px-4",
              "py-2",
              "rounded-lg",
              "text-xs",
              "font-medium",
              "transition-all",
              "border",
              filas.length && cargando === ""
                ? "bg-foreground border-foreground text-background hover:bg-[#333]" // negro activo
                : "bg-secondary border-border text-muted-foreground cursor-not-allowed",
            ].join(" ")}
          >
            <IcoDownload />
            {cargando === "pdf" ? "Generando..." : "PDF"}
          </button>
        </div>
      </div>

      {/* ── Filtros ── */}
      <div
        className={[
          "grid",           // rejilla CSS Grid
          "grid-cols-1",    // 1 columna en móvil
          "sm:grid-cols-2", // 2 columnas en tablet+
          "gap-4",          // espacio 16px entre filtros
          "mb-6",           // margen inferior 24px
        ].join(" ")}
      >
        {/* Selector de fecha */}
        <div>
          <label
            className={[
              "block",              // elemento de bloque
              "text-xs",            // fuente 12px
              "font-medium",        // peso 500
              "text-muted-foreground", // color gris
              "mb-1.5",             // margen inferior 6px
              "uppercase",          // en mayúsculas
              "tracking-wider",     // espaciado de letras
            ].join(" ")}
          >
            Fecha del informe
          </label>
          <input
            type="date"
            value={fechaStr}
            onChange={e => setFechaStr(e.target.value)}
            // min/max limitan al rango con datos disponibles
            min={fechasDisponibles.at(-1)?.toISOString().split("T")[0]}
            max={new Date().toISOString().split("T")[0]}
            style={{ fontFamily: "DM Mono, monospace" }}
            className={[
              "w-full",              // ancho completo
              "bg-secondary",        // fondo gris claro
              "border",              // borde 1px
              "border-border",       // color gris
              "text-foreground",     // texto negro
              "rounded-lg",          // esquinas redondeadas 8px
              "px-3.5",              // padding horizontal 14px
              "py-2.5",              // padding vertical 10px
              "text-sm",             // fuente 14px
              "focus:outline-none",  // elimina el outline del navegador
              "focus:border-foreground", // borde negro al enfocar
              "transition-colors",   // anima el borde
            ].join(" ")}
          />
        </div>

        {/* Selector de laboratorio */}
        <div>
          <label
            className={[
              "block",
              "text-xs",
              "font-medium",
              "text-muted-foreground",
              "mb-1.5",
              "uppercase",
              "tracking-wider",
            ].join(" ")}
          >
            Laboratorio
          </label>
          <select
            value={idLab}
            onChange={e => setIdLab(Number(e.target.value))}
            style={{ fontFamily: "DM Mono, monospace" }}
            className={[
              "w-full",
              "bg-secondary",
              "border",
              "border-border",
              "text-foreground",
              "rounded-lg",
              "px-3.5",
              "py-2.5",
              "text-sm",
              "focus:outline-none",
              "focus:border-foreground",
              "transition-colors",
              "cursor-pointer",       // cursor de puntero para indicar interactividad
            ].join(" ")}
          >
            <option value={0}>Todos los laboratorios</option>
            {LABORATORIOS.map(l => (
              <option key={l.id} value={l.id}>{l.nombre}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Tarjetas de resumen ── */}
      <div
        className={[
          "grid",              // rejilla
          "grid-cols-3",       // 3 columnas: alumnos · sesiones · horas totales
          "gap-3",             // espacio 12px
          "mb-6",              // margen inferior 24px
        ].join(" ")}
      >
        {[
          { label: "Estudiantes únicos", val: resumen.alumnos },
          { label: "Sesiones registradas", val: resumen.sesiones },
          { label: "Tiempo total", val: fmtDuracion(resumen.totalMins) },
        ].map(({ label, val }) => (
          <div
            key={label}
            className={[
              "bg-secondary",  // fondo gris muy claro
              "border",        // borde 1px
              "border-border", // color gris
              "rounded-xl",    // esquinas redondeadas 12px
              "px-4",          // padding horizontal 16px
              "py-3",          // padding vertical 12px
              "text-center",   // centra el contenido
            ].join(" ")}
          >
            <p
              className={["text-xl", "font-bold", "text-foreground", "tabular-nums"].join(" ")}
              style={{ fontFamily: "DM Mono, monospace" }}
            >
              {val}
            </p>
            <p className={["text-[10px]", "text-muted-foreground", "uppercase", "tracking-wider", "mt-0.5"].join(" ")}>
              {label}
            </p>
          </div>
        ))}
      </div>

      {/* ── Tabla de previsualización ── */}
      {filas.length > 0 ? (
        <div className="overflow-x-auto">
          {/* Cabecera de la tabla previa */}
          <p
            className={["text-[10px]", "text-muted-foreground", "uppercase", "tracking-wider", "mb-3"].join(" ")}
            style={{ fontFamily: "DM Mono, monospace" }}
          >
            Vista previa — {filas.length} registros
          </p>
          <table className="w-full text-xs">
            <thead>
              <tr className={["border-b", "border-border"].join(" ")}>
                {["Código", "Laboratorio", "PC", "Inicio", "Fin", "Duración"].map(h => (
                  <th
                    key={h}
                    className={[
                      "text-left",              // alineado a la izquierda
                      "text-[10px]",            // fuente 10px
                      "text-muted-foreground",  // color gris
                      "uppercase",              // mayúsculas
                      "tracking-wider",         // espaciado
                      "pb-2.5",                 // padding inferior 10px
                      "pr-5",                   // padding derecho 20px
                      "last:pr-0",              // sin padding en la última columna
                    ].join(" ")}
                    style={{ fontFamily: "DM Mono, monospace" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map((f, i) => (
                <tr
                  key={`prev-${f.codigo}-${f.pc}-${i}`}
                  className={[
                    "border-b",              // separador entre filas
                    "border-border/50",      // borde más sutil (50% opacidad)
                    "hover:bg-secondary/60", // fondo gris suave al hover
                    "transition-colors",     // anima el hover
                    i === filas.length - 1 ? "border-b-0" : "", // sin borde en la última fila
                  ].join(" ")}
                >
                  <td className="py-2.5 pr-5 text-foreground font-medium"
                      style={{ fontFamily: "DM Mono, monospace" }}>
                    {f.codigo}
                  </td>
                  <td className="py-2.5 pr-5 text-muted-foreground">{f.laboratorio}</td>
                  <td className="py-2.5 pr-5 text-foreground"
                      style={{ fontFamily: "DM Mono, monospace" }}>
                    {f.pc}
                  </td>
                  <td className="py-2.5 pr-5 text-muted-foreground"
                      style={{ fontFamily: "DM Mono, monospace" }}>
                    {f.inicio}
                  </td>
                  <td className="py-2.5 pr-5 text-muted-foreground"
                      style={{ fontFamily: "DM Mono, monospace" }}>
                    {f.fin}
                  </td>
                  <td className="py-2.5">
                    <span
                      className={[
                        "bg-secondary",   // fondo gris claro
                        "border",         // borde 1px
                        "border-border",  // color gris
                        "text-foreground",// texto negro
                        "px-2",           // padding horizontal 8px
                        "py-0.5",         // padding vertical 2px
                        "rounded-md",     // esquinas redondeadas
                      ].join(" ")}
                      style={{ fontFamily: "DM Mono, monospace" }}
                    >
                      {f.horas}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        /* Estado vacío: sin registros para esa combinación de filtros */
        <div
          className={[
            "text-center",    // centra el mensaje
            "py-12",          // padding vertical 48px
            "border",         // borde 1px
            "border-dashed",  // estilo discontinuo (indica estado vacío)
            "border-border",  // color gris claro
            "rounded-xl",     // esquinas redondeadas 12px
          ].join(" ")}
        >
          <p
            className={["text-muted-foreground", "text-xs"].join(" ")}
            style={{ fontFamily: "DM Mono, monospace" }}
          >
            Sin registros para la fecha y laboratorio seleccionados.
          </p>
          <p className={["text-muted-foreground/50", "text-[10px]", "mt-1"].join(" ")}>
            Prueba con otra fecha — los datos de demo cubren los últimos 30 días.
          </p>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 7E. DIRECTOR DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────

/**
 * DirectorDashboard — Panel consolidado de los 4 laboratorios.
 * Recibe `clases` del store reactivo de App (se actualiza al instante cuando
 * un Docente finaliza una clase).
 */

// ─── Íconos auxiliares para DocenteDashboard ─────────────────────────────────
const IcoPlay = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
  </svg>
);
const IcoFlag = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v18m0-13.5V3l8 4.5 8-4.5v12l-8 4.5L3 15" />
  </svg>
);
const IcoClock = () => (
  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);
const IcoCheckD = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
  </svg>
);

type StepDocente = "lab" | "curso" | "clase" | "resumen";

/**
 * DocenteDashboard — Flujo de 3 pasos:
 *   1. Selección de laboratorio (disponibilidad en tiempo real)
 *   2. Selección de curso + botón "Iniciar Clase"
 *   3. Monitoreo en vivo (grid 20 PCs) + botón "Finalizar Clase"
 *
 * Al finalizar → llama onNuevaClase(registro) para persistir en Supabase
 * y actualizar el store del Director reactivamente.
 */
function DocenteDashboard({
  usuario,
  onNuevaClase,
}: {
  usuario: UsuarioWeb;
  onNuevaClase: (c: ClaseRegistro) => void;
}) {
  const [step,         setStep]         = useState<StepDocente>("lab");
  const [labElegido,   setLabElegido]   = useState<Laboratorio | null>(null);
  const [cursoElegido, setCursoElegido] = useState<Curso | null>(null);
  const [claseActiva,  setClaseActiva]  = useState<ClaseRegistro | null>(null);
  const [maquinas,     setMaquinas]     = useState<Computadora[]>([]);
  const [elapsed,      setElapsed]      = useState(0);

  useEffect(() => {
    if (step !== "clase") return;
    const t = setInterval(() => setElapsed(s => s + 1), 1_000);
    return () => clearInterval(t);
  }, [step]);

  // Simula nuevas conexiones de estudiantes cada 20 s
  useEffect(() => {
    if (step !== "clase") return;
    const t = setInterval(() => {
      setMaquinas(prev => {
        const libres = prev.filter(p => p.estado === "DISPONIBLE");
        if (!libres.length) return prev;
        const target = libres[Math.floor(Date.now() / 7_000) % libres.length];
        const nom = NOMBRES_ESTUDIANTES[target.idComputadora % NOMBRES_ESTUDIANTES.length];
        const cod = CODIGOS[target.idComputadora % CODIGOS.length];
        setClaseActiva(p2 => {
          if (!p2 || p2.maquinas.some(m => m.idComputadora === target.idComputadora)) return p2;
          return { ...p2, maquinas: [...p2.maquinas, { idComputadora: target.idComputadora, usuarioNombre: nom, codigoUsuario: cod, horaConexion: new Date() }] };
        });
        return prev.map(p => p.idComputadora === target.idComputadora
          ? { ...p, estado: "EN_USO" as EstadoPC, usuarioActual: cod, inicioSesion: new Date() }
          : p
        );
      });
    }, 20_000);
    return () => clearInterval(t);
  }, [step]);

  const fmtElapsed = (s: number) => {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sc = s % 60;
    return h > 0 ? `${h}h ${String(m).padStart(2,"0")}m ${String(sc).padStart(2,"0")}s`
                 : `${String(m).padStart(2,"0")}m ${String(sc).padStart(2,"0")}s`;
  };

  const iniciarClase = () => {
    if (!labElegido || !cursoElegido) return;
    const pcs = estadisticasService.getPcsPorLab(labElegido.id);
    setMaquinas(pcs);
    setClaseActiva({
      idClase: Date.now(),
      docenteNombre: usuario.nombre,
      idLaboratorio: labElegido.id,
      nombreLaboratorio: labElegido.nombre,
      codigoCurso: cursoElegido.codigo,
      nombreCurso: cursoElegido.nombre,
      fecha: new Date(), horaInicio: new Date(),
      maquinas: pcs.filter(p => p.estado === "EN_USO").map(p => ({
        idComputadora: p.idComputadora,
        usuarioNombre: NOMBRES_ESTUDIANTES[p.idComputadora % NOMBRES_ESTUDIANTES.length],
        codigoUsuario: p.usuarioActual,
        horaConexion: p.inicioSesion ?? new Date(),
      })),
      estado: "EN_CURSO",
    });
    setElapsed(0); setStep("clase");
  };

  // Clase finalizada guardada — se muestra en la pantalla de resumen
  const [claseTerminada, setClaseTerminada] = useState<ClaseRegistro | null>(null);

  const finalizarClase = () => {
    if (!claseActiva) return;
    const ahora    = new Date();
    const duracion = Math.max(1, Math.floor((ahora.getTime() - claseActiva.horaInicio.getTime()) / 60_000));
    const registro: ClaseRegistro = {
      ...claseActiva,
      horaFin: ahora,
      duracionMinutos: duracion,
      maquinas: claseActiva.maquinas.map(m => ({
        ...m,
        minutos: m.horaConexion
          ? Math.floor((ahora.getTime() - m.horaConexion.getTime()) / 60_000)
          : duracion,
      })),
      estado: "FINALIZADA",
    };
    onNuevaClase(registro);
    setClaseTerminada(registro);           // muestra pantalla de resumen
    setClaseActiva(null); setMaquinas([]); setElapsed(0);
    setStep("resumen" as StepDocente);
  };

  if (step === "lab") return (
    <div className="p-8 space-y-7 min-h-screen" style={{ fontFamily: "DM Sans, sans-serif" }}>
      <div className="border-b border-border pb-6">
        <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1"
           style={{ fontFamily: "DM Mono, monospace" }}>Paso 1 de 2</p>
        <h1 className="text-2xl font-semibold text-foreground">Selecciona el laboratorio</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Bienvenido, <span className="text-foreground font-medium">{usuario.nombre}</span>. Elige dónde impartirás tu clase.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {LABORATORIOS.map(lab => {
          const pcs = estadisticasService.getPcsPorLab(lab.id);
          const libres = pcs.filter(p => p.estado === "DISPONIBLE").length;
          const ocup   = pcs.filter(p => p.estado === "EN_USO").length;
          return (
            <button key={lab.id} onClick={() => { setLabElegido(lab); setStep("curso"); }}
              className="text-left p-5 rounded-xl border border-border bg-card hover:border-foreground hover:shadow-sm transition-all">
              <div className="flex items-start justify-between mb-3">
                <span className="text-foreground font-semibold">{lab.nombre}</span>
                <span className="text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full bg-green-100 text-green-700">Disponible</span>
              </div>
              <p className="text-muted-foreground text-xs mb-1">{lab.encargado}</p>
              <p className="text-muted-foreground text-xs mb-4" style={{ fontFamily: "DM Mono, monospace" }}>
                {lab.horarioApertura} – {lab.horarioCierre}
              </p>
              <div className="flex items-center gap-4 text-xs">
                <span className="flex items-center gap-1.5 text-green-700"><span className="w-2 h-2 bg-green-500 rounded-full" />{libres} libres</span>
                <span className="flex items-center gap-1.5 text-red-600"><span className="w-2 h-2 bg-red-500 rounded-full" />{ocup} ocupadas</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );

  if (step === "curso") return (
    <div className="p-8 space-y-7 min-h-screen" style={{ fontFamily: "DM Sans, sans-serif" }}>
      <div className="border-b border-border pb-6 flex items-start justify-between flex-wrap gap-4">
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1"
             style={{ fontFamily: "DM Mono, monospace" }}>Paso 2 de 2 · {labElegido?.nombre}</p>
          <h1 className="text-2xl font-semibold text-foreground">Selecciona el curso</h1>
        </div>
        <button onClick={() => { setCursoElegido(null); setStep("lab"); }}
          className="text-sm text-muted-foreground hover:text-foreground border border-border hover:border-foreground px-4 py-2 rounded-lg transition-all">
          ← Cambiar lab
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {CURSOS.map(c => (
          <button key={c.idCurso}
            onClick={() => setCursoElegido(prev => prev?.idCurso === c.idCurso ? null : c)}
            className={["text-left p-4 rounded-xl border transition-all",
              cursoElegido?.idCurso === c.idCurso ? "bg-foreground border-foreground" : "bg-card border-border hover:border-foreground"].join(" ")}
          >
            <div className="flex items-center justify-between">
              <span className={["text-[10px] font-mono", cursoElegido?.idCurso === c.idCurso ? "text-background/60" : "text-muted-foreground"].join(" ")}>{c.codigo}</span>
              {cursoElegido?.idCurso === c.idCurso && <span className="text-background"><IcoCheckD /></span>}
            </div>
            <p className={["text-sm font-medium mt-1", cursoElegido?.idCurso === c.idCurso ? "text-background" : "text-foreground"].join(" ")}>{c.nombre}</p>
          </button>
        ))}
      </div>
      <button disabled={!cursoElegido} onClick={iniciarClase}
        className={["w-full py-3.5 rounded-xl font-semibold text-sm border transition-all flex items-center justify-center gap-2",
          cursoElegido ? "bg-foreground border-foreground text-background hover:bg-[#333]"
                       : "bg-secondary border-border text-muted-foreground cursor-not-allowed"].join(" ")}
      >
        <IcoPlay /> Iniciar Clase
      </button>
    </div>
  );

  return (
    <div className="p-8 space-y-6 min-h-screen" style={{ fontFamily: "DM Sans, sans-serif" }}>
      <div className="bg-foreground text-background rounded-xl p-5 flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            <span className="text-green-300 text-[10px] uppercase tracking-widest" style={{ fontFamily: "DM Mono, monospace" }}>Clase en curso</span>
          </div>
          <p className="font-semibold text-lg">{cursoElegido?.nombre}</p>
          <p className="text-background/60 text-sm mt-0.5">{usuario.nombre} · {labElegido?.nombre}</p>
          <p className="text-background/40 text-xs mt-0.5" style={{ fontFamily: "DM Mono, monospace" }}>
            Inicio: {claseActiva?.horaInicio.toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"})}
          </p>
        </div>
        <div className="flex items-center gap-5">
          <div className="text-right">
            <p className="text-background/40 text-[10px] uppercase tracking-wider">Duración</p>
            <p className="text-background font-bold text-2xl" style={{ fontFamily: "DM Mono, monospace" }}>{fmtElapsed(elapsed)}</p>
          </div>
          <button onClick={finalizarClase}
            className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-5 py-2.5 rounded-xl font-semibold text-sm transition-colors">
            <IcoFlag /> Finalizar Clase
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label:"PCs libres",   val: maquinas.filter(p => p.estado==="DISPONIBLE").length },
          { label:"PCs ocupadas", val: maquinas.filter(p => p.estado==="EN_USO").length },
          { label:"Estudiantes",  val: (claseActiva?.maquinas ?? []).length },
        ].map(({ label, val }) => (
          <div key={label} className="bg-card border border-border rounded-xl px-4 py-3 text-center">
            <p className="text-2xl font-bold text-foreground tabular-nums" style={{ fontFamily: "DM Mono, monospace" }}>{val}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      <div>
        <h2 className="text-foreground font-medium text-sm mb-4">Mapa de equipos — {labElegido?.nombre}</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
          {maquinas.map(pc => {
            const enUso = pc.estado === "EN_USO";
            const info  = claseActiva?.maquinas.find(m => m.idComputadora === pc.idComputadora);
            return (
              <div key={pc.idComputadora}
                className={["border rounded-xl p-3 transition-all",
                  enUso ? "bg-red-50 border-red-200" : "bg-white border-[#e5e5e5]"].join(" ")}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-foreground" style={{ fontFamily: "DM Mono, monospace" }}>
                    PC-{String(pc.idComputadora).padStart(2,"0")}
                  </span>
                  <span className={["w-2.5 h-2.5 rounded-full", enUso ? "bg-red-500" : "bg-green-400"].join(" ")} />
                </div>
                {enUso ? (
                  <>
                    <p className="text-[9px] font-semibold text-red-500 uppercase tracking-wide mb-1.5">🔴 Conectada</p>
                    <p className="text-xs font-semibold text-foreground leading-tight">
                      {info?.usuarioNombre ?? NOMBRES_ESTUDIANTES[pc.idComputadora % NOMBRES_ESTUDIANTES.length]}
                    </p>
                    <p className="text-[10px] text-muted-foreground" style={{ fontFamily: "DM Mono, monospace" }}>
                      {info?.codigoUsuario ?? pc.usuarioActual ?? ""}
                    </p>
                    <div className="flex items-center gap-1 mt-1.5 text-muted-foreground">
                      <IcoClock />
                      <span className="text-[10px]" style={{ fontFamily: "DM Mono, monospace" }}>
                        {(info?.horaConexion ?? pc.inicioSesion)?.toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"}) ?? "—"}
                      </span>
                    </div>
                  </>
                ) : (
                  <p className="text-[10px] text-green-600">⚪ Disponible</p>
                )}
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-5 mt-3">
          {[{dot:"bg-green-400",label:"Disponible"},{dot:"bg-red-500",label:"Ocupada"}].map(({ dot, label }) => (
            <div key={label} className="flex items-center gap-2">
              <span className={["w-2 h-2 rounded-full", dot].join(" ")} />
              <span className="text-muted-foreground text-xs">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // ── Pantalla de resumen post-clase ──────────────────────────────────────────
  if (step === "resumen" && claseTerminada) return (
    <div className="p-8 min-h-screen flex items-center justify-center" style={{ fontFamily: "DM Sans, sans-serif" }}>
      <div className="w-full max-w-xl">

        {/* Encabezado de éxito */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-green-100 mb-4">
            <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold text-foreground">Clase finalizada</h1>
          <p className="text-muted-foreground text-sm mt-1">
            El registro fue enviado al panel del Director.
          </p>
        </div>

        {/* Tarjeta de resumen */}
        <div className="bg-card border border-border rounded-xl divide-y divide-border">

          {/* Info de la clase */}
          <div className="p-5 space-y-3">
            {[
              { label: "Curso",        val: claseTerminada.nombreCurso },
              { label: "Laboratorio",  val: claseTerminada.nombreLaboratorio },
              { label: "Docente",      val: claseTerminada.docenteNombre },
              { label: "Fecha",        val: claseTerminada.fecha.toLocaleDateString("es-MX",{weekday:"long",day:"numeric",month:"long"}) },
              { label: "Inicio",       val: claseTerminada.horaInicio.toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"}) },
              { label: "Fin",          val: claseTerminada.horaFin?.toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"}) ?? "—" },
              { label: "Duración",     val: fmtDuracion(claseTerminada.duracionMinutos ?? 0) },
            ].map(({ label, val }) => (
              <div key={label} className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground uppercase tracking-wider"
                      style={{ fontFamily: "DM Mono, monospace" }}>{label}</span>
                <span className="text-sm font-medium text-foreground">{val}</span>
              </div>
            ))}
          </div>

          {/* Métricas */}
          <div className="p-5 grid grid-cols-2 gap-4">
            <div className="text-center">
              <p className="text-3xl font-bold text-foreground tabular-nums"
                 style={{ fontFamily: "DM Mono, monospace" }}>
                {claseTerminada.maquinas.length}
              </p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">
                Equipos utilizados
              </p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-foreground tabular-nums"
                 style={{ fontFamily: "DM Mono, monospace" }}>
                {new Set(claseTerminada.maquinas.map(m => m.codigoUsuario)).size}
              </p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">
                Estudiantes únicos
              </p>
            </div>
          </div>

          {/* Lista de máquinas usadas */}
          {claseTerminada.maquinas.length > 0 && (
            <div className="p-5">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-3"
                 style={{ fontFamily: "DM Mono, monospace" }}>
                Detalle por equipo
              </p>
              <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                {claseTerminada.maquinas.map(m => (
                  <div key={`res-${m.idComputadora}`}
                    className="flex items-center justify-between py-1.5 border-b border-border/40 last:border-0">
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-bold text-foreground w-12"
                            style={{ fontFamily: "DM Mono, monospace" }}>
                        PC-{String(m.idComputadora).padStart(2,"0")}
                      </span>
                      <div>
                        <p className="text-xs font-medium text-foreground">{m.usuarioNombre ?? "—"}</p>
                        <p className="text-[10px] text-muted-foreground" style={{ fontFamily: "DM Mono, monospace" }}>
                          {m.codigoUsuario ?? ""}
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] text-muted-foreground" style={{ fontFamily: "DM Mono, monospace" }}>
                      {m.horaConexion?.toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"}) ?? "—"}
                      {m.minutos ? ` · ${fmtDuracion(m.minutos)}` : ""}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Botón para iniciar una nueva clase */}
        <button
          onClick={() => {
            setClaseTerminada(null);
            setLabElegido(null);
            setCursoElegido(null);
            setStep("lab");
          }}
          className="w-full mt-6 py-3 rounded-xl bg-foreground text-background hover:bg-[#333] font-semibold text-sm transition-colors"
        >
          Iniciar nueva clase
        </button>
      </div>
    </div>
  );

  // Fallback (no debería llegar aquí)
  return null;
}

function DirectorDashboard({ clases, apiOnline, loadingClases }: {
  clases: ClaseRegistro[];
  apiOnline: boolean;
  loadingClases: boolean;
}) {
  const data = useMemo(() => estadisticasService.getGenerales(), []);
  const [query,         setQuery]        = useState("");
  const [historial,     setHistorial]    = useState<RegistroUso[]>([]);
  const [buscado,       setBuscado]      = useState(false);
  const [claseDetalle,  setClaseDetalle]  = useState<ClaseRegistro | null>(null);
  const [exportandoC,   setExportandoC]   = useState<"" | "pdf" | "excel">("");
  /** Filtros del historial de clases */
  const [filtroDocente, setFiltroDocente] = useState("");
  const [filtroLab,     setFiltroLab]     = useState(0);      // 0 = todos
  /** Paginación del historial */
  const FILAS_POR_PAG = 8;
  const [pagina,        setPagina]        = useState(1);
  /** Lab actualmente visible en la sección de cuadrícula. Por defecto el 1. */
  const [labSeleccionado, setLabSeleccionado] = useState<number>(1);

  const labNombre = (id: number) => LABORATORIOS.find(l => l.id === id)?.nombre ?? `Lab ${id}`;
  // BAR_COLORS y helpers de gráficas definidos al inicio del módulo

  const buscar = () => {
    if (!query.trim()) return;
    setBuscado(true);
    setHistorial(estadisticasService.getHistorial(query.trim().toUpperCase()));
  };

  return (
    <div
      className={[
        "p-8",        // padding 32px en todos los lados
        "space-y-7",  // espacio vertical de 28px entre secciones directas hijas
        "min-h-screen",// ocupa al menos la altura completa de la pantalla
      ].join(" ")}
      style={{ fontFamily: "DM Sans, sans-serif" }}
    >

      {/* ── Encabezado ── */}
      <div
        className={[
          "flex",            // fila horizontal
          "items-end",       // alinea el texto y la fecha al borde inferior
          "justify-between", // texto a la izquierda, fecha a la derecha
          "border-b",        // línea divisora inferior
          "border-border",   // color gris claro
          "pb-6",            // padding inferior 24px (espacio antes del divisor)
        ].join(" ")}
      >
        <div>
          <p
            className={[
              "text-[10px]",           // fuente 10px
              "text-muted-foreground", // color gris
              "uppercase",             // en mayúsculas
              "tracking-widest",       // espaciado máximo de letras
              "mb-1",                  // margen inferior 4px
            ].join(" ")}
            style={{ fontFamily: "DM Mono, monospace" }}
          >
            Panel Ejecutivo
          </p>
          <h1
            className={[
              "text-2xl",         // fuente 24px
              "font-semibold",    // peso 600
              "text-foreground",  // color negro
            ].join(" ")}
          >
            Vista del Director
          </h1>
          <p className={["text-muted-foreground", "text-sm", "mt-0.5"].join(" ")}>
            Consolidado de los 4 laboratorios institucionales
          </p>
        </div>
        <span
          className={["text-xs", "text-muted-foreground"].join(" ")}
          style={{ fontFamily: "DM Mono, monospace" }}
        >
          {new Date().toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" })}
        </span>
      </div>

      {/* ── KPIs ── */}
      <div
        className={[
          "grid",                  // rejilla CSS Grid
          "grid-cols-1",           // 1 columna en móvil
          "md:grid-cols-3",        // 3 columnas en pantallas ≥ 768px
          "gap-4",                 // espacio de 16px entre tarjetas
        ].join(" ")}
      >
        <KpiCard label="Alumnos únicos hoy" value={String(data.alumnosHoy)}
          sub="Usuarios registrados en el día" icon={<IcoUsers />} dot="bg-foreground" />
        <KpiCard label="PC más desgastada" value={`PC-${data.pcMax.idComputadora}`}
          sub={`Lab ${data.pcMax.idLaboratorio} · ${data.pcMax.minutosUsoHoy} min hoy`}
          icon={<IcoCpu />} dot="bg-amber-500" />
        <KpiCard label="Mayor afluencia"
          value={LABORATORIOS.find(l => l.id === data.topLabId)?.nombre.replace("Lab. ", "") ?? "—"}
          sub={`${data.topCount} registros este mes`} icon={<IcoTrend />} dot="bg-green-500" />
      </div>

      {/* ── Gráficas ── */}
      <div
        className={[
          "grid",              // rejilla CSS Grid
          "grid-cols-1",       // 1 columna en móvil
          "lg:grid-cols-2",    // 2 columnas en pantallas ≥ 1024px
          "gap-5",             // espacio de 20px entre gráficas
        ].join(" ")}
      >

        {/* Gráfica de barras: horas por laboratorio */}
        <div
          className={[
            "bg-card",       // fondo blanco
            "border",        // borde 1px
            "border-border", // color gris claro
            "rounded-xl",    // esquinas redondeadas 12px
            "p-6",           // padding 24px
          ].join(" ")}
        >
          <h2 className={["text-foreground", "font-medium", "text-sm"].join(" ")}>
            Horas consumidas — mes actual
          </h2>
          <p
            className={["text-muted-foreground", "text-xs", "mt-0.5", "mb-6"].join(" ")}
            style={{ fontFamily: "DM Mono, monospace" }}
          >
            Total por laboratorio
          </p>
          {/* HorasBarChart — barras horizontales CSS, sin Recharts */}
          <HorasBarChart data={data.horasPorLab} />
        </div>

        {/* Gráfica de área: afluencia por hora */}
        <div
          className={[
            "bg-card",
            "border",
            "border-border",
            "rounded-xl",
            "p-6",
          ].join(" ")}
        >
          <h2 className={["text-foreground", "font-medium", "text-sm"].join(" ")}>
            Horas pico de afluencia
          </h2>
          <p
            className={["text-muted-foreground", "text-xs", "mt-0.5", "mb-6"].join(" ")}
            style={{ fontFamily: "DM Mono, monospace" }}
          >
            Distribución 08:00 – 20:00 hrs
          </p>
          {/* AfluenciaLineChart — área SVG propia, sin Recharts */}
          <AfluenciaLineChart data={data.afluencia} />
        </div>
      </div>

      {/* ── Auditoría ── */}
      <div
        className={[
          "bg-card",
          "border",
          "border-border",
          "rounded-xl",
          "p-6",
        ].join(" ")}
      >
        <h2 className={["text-foreground", "font-medium", "text-sm"].join(" ")}>
          Auditoría por Estudiante
        </h2>
        <p
          className={["text-muted-foreground", "text-xs", "mt-0.5", "mb-6"].join(" ")}
          style={{ fontFamily: "DM Mono, monospace" }}
        >
          Historial completo de uso por código estudiantil
        </p>

        {/* Barra de búsqueda */}
        <div
          className={[
            "flex",   // fila horizontal
            "gap-2",  // espacio 8px entre input y botón
            "mb-6",   // margen inferior 24px
          ].join(" ")}
        >
          <div
            className={[
              "relative", // posicionamiento relativo para el ícono absoluto dentro
              "flex-1",   // ocupa todo el espacio disponible
            ].join(" ")}
          >
            {/* Ícono de lupa posicionado absolutamente sobre el input */}
            <span
              className={[
                "absolute",              // posición absoluta dentro del div relativo
                "left-3",               // 12px desde la izquierda
                "top-1/2",              // 50% desde arriba
                "-translate-y-1/2",     // compensa para centrar verticalmente
                "text-muted-foreground",// color gris
                "pointer-events-none",  // el ícono no intercepta clics del input
              ].join(" ")}
            >
              <IcoSearch />
            </span>
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === "Enter" && buscar()}
              placeholder="Ej: EST2401, EST2408..."
              style={{ fontFamily: "DM Mono, monospace" }}
              className={[
                "w-full",
                "bg-secondary",
                "border",
                "border-border",
                "text-foreground",
                "rounded-lg",
                "pl-9",                        // padding izquierdo 36px (espacio para el ícono)
                "pr-4",                        // padding derecho 16px
                "py-2.5",
                "placeholder:text-muted-foreground/40",
                "focus:outline-none",
                "focus:border-foreground",
                "transition-colors",
                "text-sm",
              ].join(" ")}
            />
          </div>

          <button
            onClick={buscar}
            className={[
              "bg-foreground",      // fondo negro
              "text-background",    // texto blanco
              "hover:bg-[#333333]", // gris oscuro al hover
              "px-5",               // padding horizontal 20px
              "py-2.5",             // padding vertical 10px
              "rounded-lg",         // esquinas redondeadas 8px
              "font-medium",        // peso 500
              "text-sm",            // fuente 14px
              "transition-colors",  // anima el fondo
              "shrink-0",           // no se encoge aunque el input crezca
            ].join(" ")}
          >
            Buscar
          </button>
        </div>

        {/* Tabla de resultados */}
        {historial.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className={["border-b", "border-border"].join(" ")}>
                  {["Código","Laboratorio","PC","Inicio","Fin","Duración"].map(h => (
                    <th
                      key={h}
                      className={[
                        "text-left",             // alineación a la izquierda
                        "text-[10px]",           // fuente muy pequeña
                        "text-muted-foreground", // color gris
                        "uppercase",             // en mayúsculas
                        "tracking-wider",        // espaciado de letras
                        "pb-3",                  // padding inferior 12px (separa del primer dato)
                        "pr-6",                  // padding derecho 24px (espacio entre columnas)
                        "last:pr-0",             // última columna sin padding derecho
                        "last:text-right",       // última columna alineada a la derecha
                      ].join(" ")}
                      style={{ fontFamily: "DM Mono, monospace" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {historial.map((r, i) => (
                  <tr
                    key={r.idRegistro}
                    className={[
                      "border-b",             // separador entre filas
                      "border-border/60",     // borde con 60% de opacidad (más sutil)
                      "hover:bg-secondary/60",// fondo gris muy suave al hacer hover
                      "transition-colors",    // anima el hover
                      i === historial.length - 1 ? "border-b-0" : "", // sin borde en la última fila
                    ].join(" ")}
                  >
                    <td className={["py-3","pr-6","text-foreground","font-medium","text-xs"].join(" ")}
                        style={{ fontFamily: "DM Mono, monospace" }}>
                      {r.codigoEstudiante}
                    </td>
                    <td className={["py-3","pr-6","text-muted-foreground","text-xs"].join(" ")}>
                      {labNombre(r.idLaboratorio)}
                    </td>
                    <td className={["py-3","pr-6","text-foreground","text-xs"].join(" ")}
                        style={{ fontFamily: "DM Mono, monospace" }}>
                      PC-{r.idComputadora}
                    </td>
                    <td className={["py-3","pr-6","text-muted-foreground","text-xs"].join(" ")}
                        style={{ fontFamily: "DM Mono, monospace" }}>
                      {fmtDate(r.horaInicio)}
                    </td>
                    <td className={["py-3","pr-6","text-muted-foreground","text-xs"].join(" ")}
                        style={{ fontFamily: "DM Mono, monospace" }}>
                      {fmtDate(r.horaFin)}
                    </td>
                    <td className={["py-3","text-right"].join(" ")}>
                      <span
                        className={[
                          "bg-secondary",   // fondo gris claro
                          "border",         // borde 1px
                          "border-border",  // color gris
                          "text-foreground",// texto negro
                          "text-xs",        // fuente 12px
                          "px-2",           // padding horizontal 8px
                          "py-1",           // padding vertical 4px
                          "rounded-md",     // esquinas redondeadas 6px
                        ].join(" ")}
                        style={{ fontFamily: "DM Mono, monospace" }}
                      >
                        {r.minutosTotales} min
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : buscado ? (
          <div
            className={[
              "text-center",      // centra el texto
              "py-10",            // padding vertical 40px
              "border",           // borde 1px
              "border-dashed",    // estilo discontinuo (indica estado vacío)
              "border-border",    // color gris claro
              "rounded-lg",       // esquinas redondeadas 8px
            ].join(" ")}
          >
            <p className={["text-muted-foreground", "text-sm"].join(" ")}>
              Sin registros para{" "}
              <span className="font-mono text-foreground">"{query}"</span>
            </p>
          </div>
        ) : (
          <div
            className={[
              "text-center",
              "py-10",
              "border",
              "border-dashed",
              "border-border",
              "rounded-lg",
            ].join(" ")}
          >
            <p
              className={["text-muted-foreground", "text-xs"].join(" ")}
              style={{ fontFamily: "DM Mono, monospace" }}
            >
              Ingresa un código para consultar el historial
            </p>
          </div>
        )}
      </div>

      {/* ── Vista por Laboratorio ── */}
      <div>
        {/* Encabezado de sección */}
        <div
          className={[
            "flex",            // fila horizontal
            "items-end",       // alinea al fondo
            "justify-between", // título a la izq, estado a la der
            "mb-5",            // margen inferior 20px
          ].join(" ")}
        >
          <div>
            <p
              className={[
                "text-[10px]",           // fuente 10px
                "text-muted-foreground", // color gris
                "uppercase",             // en mayúsculas
                "tracking-widest",       // espaciado máximo
                "mb-1",                  // margen inferior 4px
              ].join(" ")}
              style={{ fontFamily: "DM Mono, monospace" }}
            >
              Vista Operativa
            </p>
            <h2 className={["text-foreground", "font-semibold", "text-lg"].join(" ")}>
              Estado por Laboratorio
            </h2>
            <p className={["text-muted-foreground", "text-sm", "mt-0.5"].join(" ")}>
              Cuadrícula en tiempo real con historial de uso por equipo
            </p>
          </div>
          {/* Nombre del lab actualmente seleccionado */}
          <span
            className={[
              "text-xs",              // fuente 12px
              "text-muted-foreground",// color gris
              "bg-secondary",         // fondo gris claro
              "border",               // borde 1px
              "border-border",        // color gris
              "px-3",                 // padding horizontal 12px
              "py-1.5",               // padding vertical 6px
              "rounded-lg",           // esquinas redondeadas 8px
            ].join(" ")}
            style={{ fontFamily: "DM Mono, monospace" }}
          >
            {LABORATORIOS.find(l => l.id === labSeleccionado)?.encargado}
          </span>
        </div>

        {/* Pestañas de selección de laboratorio */}
        <div
          className={[
            "flex",          // fila horizontal
            "gap-1",         // espacio 4px entre pestañas
            "mb-6",          // margen inferior 24px
            "bg-secondary",  // fondo gris del contenedor de tabs
            "border",        // borde 1px
            "border-border", // color gris claro
            "rounded-xl",    // esquinas redondeadas 12px
            "p-1",           // padding 4px (deja margen alrededor de los botones)
          ].join(" ")}
        >
          {LABORATORIOS.map(lab => (
            <button
              key={lab.id}
              onClick={() => setLabSeleccionado(lab.id)}
              className={[
                "flex-1",           // cada tab ocupa el mismo ancho
                "py-2",             // padding vertical 8px
                "px-3",             // padding horizontal 12px
                "rounded-lg",       // esquinas redondeadas 8px
                "text-xs",          // fuente 12px
                "font-medium",      // peso 500
                "transition-all",   // anima todos los cambios
                "text-center",      // centra el texto
                // Estado activo: fondo blanco con sombra sutil
                labSeleccionado === lab.id
                  ? "bg-white border border-border text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              ].join(" ")}
            >
              {/* Nombre abreviado del lab para que quepan las 4 tabs */}
              {lab.nombre.replace("Lab. ", "")}
            </button>
          ))}
        </div>

        {/* Info rápida del lab seleccionado */}
        <div
          className={[
            "flex",          // fila horizontal
            "items-center",  // centra verticalmente
            "gap-6",         // espacio 24px entre datos
            "mb-5",          // margen inferior 20px
            "px-1",          // padding horizontal 4px
          ].join(" ")}
        >
          {(() => {
            const lab = LABORATORIOS.find(l => l.id === labSeleccionado)!;
            const pcsLab = COMPUTADORAS.filter(c => c.idLaboratorio === labSeleccionado);
            return (
              <>
                <div>
                  <p className={["text-[10px]", "text-muted-foreground", "uppercase", "tracking-wider"].join(" ")}>
                    Encargado
                  </p>
                  <p className={["text-foreground", "text-sm", "font-medium", "mt-0.5"].join(" ")}>
                    {lab.encargado}
                  </p>
                </div>
                <div className={["w-px", "h-8", "bg-border"].join(" ")} />
                <div>
                  <p className={["text-[10px]", "text-muted-foreground", "uppercase", "tracking-wider"].join(" ")}>
                    Horario
                  </p>
                  <p
                    className={["text-foreground", "text-sm", "font-medium", "mt-0.5"].join(" ")}
                    style={{ fontFamily: "DM Mono, monospace" }}
                  >
                    {lab.horarioApertura} – {lab.horarioCierre}
                  </p>
                </div>
                <div className={["w-px", "h-8", "bg-border"].join(" ")} />
                {/* Contadores de estado: 3 números con etiqueta de color */}
                {[
                  { n: pcsLab.filter(p => p.estado === "DISPONIBLE").length,    label: "Disponibles", cls: "text-green-600" },
                  { n: pcsLab.filter(p => p.estado === "EN_USO").length,         label: "En uso",       cls: "text-red-600" },
                  { n: pcsLab.filter(p => p.estado === "MANTENIMIENTO").length,  label: "Mtto.",        cls: "text-amber-600" },
                ].map(({ n, label, cls }) => (
                  <div key={label}>
                    <p className={["text-[10px]", "text-muted-foreground", "uppercase", "tracking-wider"].join(" ")}>
                      {label}
                    </p>
                    <p
                      className={[cls, "text-sm", "font-bold", "mt-0.5"].join(" ")}
                      style={{ fontFamily: "DM Mono, monospace" }}
                    >
                      {n}
                    </p>
                  </div>
                ))}
              </>
            );
          })()}
        </div>

        {/* Grid de PCs + ranking — componente compartido con la vista del Encargado */}
        <LabPcGrid labId={labSeleccionado} />
      </div>

      {/* ── Resumen por Docente ── */}
      {clases.length > 0 && (() => {
        // Agrupa clases por docente y calcula sus métricas
        type DocStat = { nombre: string; clases: number; minutos: number; labs: Set<number> };
        const map = new Map<string, DocStat>();
        clases.forEach(c => {
          const prev = map.get(c.docenteNombre) ?? { nombre: c.docenteNombre, clases: 0, minutos: 0, labs: new Set() };
          prev.clases++;
          prev.minutos += c.duracionMinutos ?? 0;
          prev.labs.add(c.idLaboratorio);
          map.set(c.docenteNombre, prev);
        });
        const stats = [...map.values()].sort((a, b) => b.clases - a.clases);

        return (
          <div className="bg-card border border-border rounded-xl p-6">
            <h2 className="text-foreground font-medium text-sm mb-1">Actividad por Docente</h2>
            <p className="text-muted-foreground text-xs mb-5" style={{ fontFamily: "DM Mono, monospace" }}>
              Resumen consolidado de clases impartidas
            </p>
            <div className="space-y-3">
              {stats.map((d, i) => {
                const maxClases = stats[0].clases;
                return (
                  <div key={d.nombre} className="flex items-center gap-4">
                    <span className="text-muted-foreground text-[10px] w-4 text-right shrink-0"
                          style={{ fontFamily: "DM Mono, monospace" }}>{i + 1}</span>
                    <span className="text-foreground text-xs font-medium w-40 shrink-0 truncate">{d.nombre}</span>
                    <div className="flex-1 bg-secondary rounded-full h-1.5 overflow-hidden">
                      <div className="h-full rounded-full bg-foreground transition-all duration-700"
                           style={{ width: `${(d.clases / maxClases) * 100}%` }} />
                    </div>
                    <div className="flex items-center gap-3 shrink-0 text-[10px] text-muted-foreground"
                         style={{ fontFamily: "DM Mono, monospace" }}>
                      <span><span className="text-foreground font-semibold">{d.clases}</span> clases</span>
                      <span>{fmtDuracion(d.minutos)}</span>
                      <span>{d.labs.size} lab{d.labs.size > 1 ? "s" : ""}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ── Historial de Clases (datos de Docentes, persistidos en Supabase) ── */}
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex items-start justify-between flex-wrap gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-foreground font-medium text-sm">Historial de Clases</h2>
              {apiOnline
                ? <span className="text-[9px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">Supabase</span>
                : <span className="text-[9px] bg-secondary text-muted-foreground px-1.5 py-0.5 rounded-full font-medium">Local</span>}
            </div>
            <p className="text-muted-foreground text-xs" style={{ fontFamily: "DM Mono, monospace" }}>
              {clases.length} sesiones · clic en fila para ver detalle de máquinas
            </p>
          </div>
          <div className="flex gap-2">
            <button disabled={!clases.length || exportandoC !== ""}
              onClick={async () => { setExportandoC("excel"); await exportarClasesExcel(clases); setExportandoC(""); }}
              className={["flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium border transition-all",
                clases.length && !exportandoC
                  ? "bg-[#16a34a] border-[#16a34a] text-white hover:bg-[#15803d]"
                  : "bg-secondary border-border text-muted-foreground cursor-not-allowed"].join(" ")}
            >
              <IcoDownload /> {exportandoC === "excel" ? "Generando..." : "Excel"}
            </button>
            <button disabled={!clases.length || exportandoC !== ""}
              onClick={async () => { setExportandoC("pdf"); await exportarClasesPDF(clases); setExportandoC(""); }}
              className={["flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium border transition-all",
                clases.length && !exportandoC
                  ? "bg-foreground border-foreground text-background hover:bg-[#333]"
                  : "bg-secondary border-border text-muted-foreground cursor-not-allowed"].join(" ")}
            >
              <IcoDownload /> {exportandoC === "pdf" ? "Generando..." : "PDF"}
            </button>
          </div>
        </div>

        {/* Barra de filtros */}
        {clases.length > 0 && (
          <div className="flex gap-3 mb-5 flex-wrap">
            <div className="relative flex-1 min-w-[160px]">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
                <IcoSearch />
              </span>
              <input
                type="text"
                value={filtroDocente}
                onChange={e => { setFiltroDocente(e.target.value); setPagina(1); }}
                placeholder="Buscar por docente o curso..."
                className="w-full bg-secondary border border-border text-foreground rounded-lg pl-9 pr-3 py-2
                           text-xs placeholder:text-muted-foreground/40 focus:outline-none focus:border-foreground transition-colors"
              />
            </div>
            <select
              value={filtroLab}
              onChange={e => { setFiltroLab(Number(e.target.value)); setPagina(1); }}
              className="bg-secondary border border-border text-foreground rounded-lg px-3 py-2 text-xs
                         focus:outline-none focus:border-foreground transition-colors cursor-pointer"
              style={{ fontFamily: "DM Mono, monospace" }}
            >
              <option value={0}>Todos los labs</option>
              {LABORATORIOS.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
            </select>
            {(filtroDocente || filtroLab > 0) && (
              <button
                onClick={() => { setFiltroDocente(""); setFiltroLab(0); }}
                className="text-xs text-muted-foreground hover:text-foreground border border-border hover:border-foreground px-3 py-2 rounded-lg transition-all"
              >
                Limpiar
              </button>
            )}
          </div>
        )}

        {(() => {
          // Aplica filtros
          const clasesFiltradas = clases.filter(c => {
            const q = filtroDocente.toLowerCase();
            const matchTexto = !q || c.docenteNombre.toLowerCase().includes(q) || c.nombreCurso.toLowerCase().includes(q);
            const matchLab   = filtroLab === 0 || c.idLaboratorio === filtroLab;
            return matchTexto && matchLab;
          });

          if (!clasesFiltradas.length && clases.length > 0) return (
            <div className="text-center py-8 border border-dashed border-border rounded-xl">
              <p className="text-muted-foreground text-xs" style={{ fontFamily: "DM Mono, monospace" }}>
                Sin resultados para los filtros aplicados.
              </p>
            </div>
          );

          return null;
        })()}

        {clases.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  {["Docente","Laboratorio","Curso","Fecha","Inicio","Fin","Duración","Equipos",""].map(h => (
                    <th key={h} className="text-left text-[10px] text-muted-foreground uppercase tracking-wider pb-3 pr-5 last:pr-0"
                        style={{ fontFamily: "DM Mono, monospace" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {clases.filter(c => {
                  const q = filtroDocente.toLowerCase();
                  return (!q || c.docenteNombre.toLowerCase().includes(q) || c.nombreCurso.toLowerCase().includes(q))
                      && (filtroLab === 0 || c.idLaboratorio === filtroLab);
                }).slice((pagina - 1) * FILAS_POR_PAG, pagina * FILAS_POR_PAG).map(c => (
                  <>
                    <tr key={c.idClase}
                      className="border-b border-border/40 hover:bg-secondary/40 transition-colors cursor-pointer"
                      onClick={() => setClaseDetalle(d => d?.idClase === c.idClase ? null : c)}
                    >
                      <td className="py-3 pr-5 text-foreground font-medium">{c.docenteNombre}</td>
                      <td className="py-3 pr-5 text-muted-foreground">{c.nombreLaboratorio}</td>
                      <td className="py-3 pr-5 text-muted-foreground">{c.nombreCurso}</td>
                      <td className="py-3 pr-5 text-muted-foreground" style={{ fontFamily: "DM Mono, monospace" }}>
                        {c.fecha.toLocaleDateString("es-MX",{day:"2-digit",month:"2-digit",year:"2-digit"})}
                      </td>
                      <td className="py-3 pr-5 text-muted-foreground" style={{ fontFamily: "DM Mono, monospace" }}>
                        {c.horaInicio.toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"})}
                      </td>
                      <td className="py-3 pr-5 text-muted-foreground" style={{ fontFamily: "DM Mono, monospace" }}>
                        {c.horaFin?.toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"}) ?? "—"}
                      </td>
                      <td className="py-3 pr-5">
                        <span className="bg-secondary border border-border text-foreground text-[10px] px-2 py-0.5 rounded-md"
                              style={{ fontFamily: "DM Mono, monospace" }}>
                          {c.duracionMinutos ? fmtDuracion(c.duracionMinutos) : "En curso"}
                        </span>
                      </td>
                      <td className="py-3 pr-5 font-medium" style={{ fontFamily: "DM Mono, monospace" }}>{c.maquinas.length} PCs</td>
                      <td className="py-3 text-right text-muted-foreground">
                        {claseDetalle?.idClase === c.idClase ? "▲" : "▼"}
                      </td>
                    </tr>
                    {claseDetalle?.idClase === c.idClase && (
                      <tr key={`det-${c.idClase}`} className="bg-secondary/20">
                        <td colSpan={9} className="px-4 py-4">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-3"
                             style={{ fontFamily: "DM Mono, monospace" }}>
                            Equipos y usuarios conectados durante la clase
                          </p>
                          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                            {c.maquinas.map(m => (
                              <div key={`dm-${m.idComputadora}`} className="bg-white border border-border rounded-lg p-2.5">
                                <p className="text-[10px] font-bold text-foreground mb-1"
                                   style={{ fontFamily: "DM Mono, monospace" }}>
                                  PC-{String(m.idComputadora).padStart(2,"0")}
                                </p>
                                <p className="text-xs font-semibold text-foreground leading-tight">{m.usuarioNombre ?? "—"}</p>
                                <p className="text-[10px] text-muted-foreground" style={{ fontFamily: "DM Mono, monospace" }}>{m.codigoUsuario ?? ""}</p>
                                <p className="text-[10px] text-muted-foreground mt-1" style={{ fontFamily: "DM Mono, monospace" }}>
                                  {m.horaConexion?.toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"}) ?? "—"}
                                  {m.minutos ? ` · ${fmtDuracion(m.minutos)}` : ""}
                                </p>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>

            {/* Paginación */}
            {(() => {
              const filtradas = clases.filter(c => {
                const q = filtroDocente.toLowerCase();
                return (!q || c.docenteNombre.toLowerCase().includes(q) || c.nombreCurso.toLowerCase().includes(q))
                    && (filtroLab === 0 || c.idLaboratorio === filtroLab);
              });
              const totalPags = Math.ceil(filtradas.length / FILAS_POR_PAG);
              if (totalPags <= 1) return null;
              return (
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
                  <p className="text-[10px] text-muted-foreground" style={{ fontFamily: "DM Mono, monospace" }}>
                    Página {pagina} de {totalPags} · {filtradas.length} registros
                  </p>
                  <div className="flex gap-1.5">
                    <button disabled={pagina === 1}
                      onClick={() => setPagina(p => p - 1)}
                      className="px-3 py-1.5 text-xs border border-border rounded-lg hover:border-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                      ← Anterior
                    </button>
                    {Array.from({ length: totalPags }, (_, i) => i + 1).map(p => (
                      <button key={p} onClick={() => setPagina(p)}
                        className={["px-3 py-1.5 text-xs rounded-lg border transition-all",
                          p === pagina ? "bg-foreground border-foreground text-background"
                                       : "border-border hover:border-foreground"].join(" ")}>
                        {p}
                      </button>
                    ))}
                    <button disabled={pagina === totalPags}
                      onClick={() => setPagina(p => p + 1)}
                      className="px-3 py-1.5 text-xs border border-border rounded-lg hover:border-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                      Siguiente →
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        ) : loadingClases ? (
          /* Skeleton rows mientras carga desde Supabase */
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={`sk-${i}`}
                className={["h-10", "rounded-lg", "bg-secondary", "animate-pulse",
                  i % 2 === 0 ? "opacity-60" : "opacity-40"].join(" ")}
              />
            ))}
            <p className="text-center text-[10px] text-muted-foreground mt-3"
               style={{ fontFamily: "DM Mono, monospace" }}>
              Cargando historial desde Supabase…
            </p>
          </div>
        ) : (
          <div className="text-center py-10 border border-dashed border-border rounded-xl">
            <p className="text-muted-foreground text-xs" style={{ fontFamily: "DM Mono, monospace" }}>
              Sin clases registradas. Cuando un docente finalice una clase aparecerá aquí.
            </p>
          </div>
        )}
      </div>

      {/* ── Panel de Exportación de Uso de PCs ── */}
      <ExportPanel />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 7E. ENCARGADO DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────

/**
 * EncargadoDashboard — Panel operativo del laboratorio asignado.
 * Muestra cabecera con info del lab, contadores de estado y el grid de 20 PCs
 * con historial de uso por equipo (compartido con la vista del Director).
 */
function EncargadoDashboard({ usuario }: { usuario: UsuarioWeb }) {
  const idLab       = usuario.idLaboratorioAsignado!;
  const laboratorio = useMemo(() => estadisticasService.getLaboratorioPorId(idLab), [idLab]);

  // Contadores derivados directamente de los datos (no necesitan estado mutable;
  // el grid en tiempo real actualiza sus propios valores internamente)
  const pcsIniciales  = useMemo(() => estadisticasService.getPcsPorLab(idLab), [idLab]);
  const disponibles   = pcsIniciales.filter(c => c.estado === "DISPONIBLE").length;
  const enUso         = pcsIniciales.filter(c => c.estado === "EN_USO").length;
  const mantenimiento = pcsIniciales.filter(c => c.estado === "MANTENIMIENTO").length;

  return (
    <div
      className={[
        "p-8",          // padding 32px
        "space-y-7",    // espacio 28px entre secciones
        "min-h-screen", // ocupa toda la pantalla
      ].join(" ")}
      style={{ fontFamily: "DM Sans, sans-serif" }}
    >
      {/* ── Cabecera: info del lab + contadores ── */}
      {laboratorio && (
        <div
          className={[
            "border-b",      // línea divisora inferior
            "border-border", // color gris claro
            "pb-6",          // padding inferior 24px
          ].join(" ")}
        >
          {/* Punto verde pulsante = sistema activo */}
          <div className={["flex", "items-center", "gap-2", "mb-2"].join(" ")}>
            <span className={["w-1.5", "h-1.5", "bg-green-500", "rounded-full", "animate-pulse"].join(" ")} />
            <span
              className={["text-green-700", "text-[10px]", "uppercase", "tracking-widest"].join(" ")}
              style={{ fontFamily: "DM Mono, monospace" }}
            >
              En operación
            </span>
          </div>

          <div className={["flex", "items-start", "justify-between", "flex-wrap", "gap-5"].join(" ")}>
            <div>
              <h1 className={["text-2xl", "font-semibold", "text-foreground"].join(" ")}>
                {laboratorio.nombre}
              </h1>
              <p className={["text-muted-foreground", "text-sm", "mt-1"].join(" ")}>
                Encargado: <span className="text-foreground">{laboratorio.encargado}</span>
                <span className="mx-2">·</span>
                Horario:{" "}
                <span className="text-foreground" style={{ fontFamily: "DM Mono, monospace" }}>
                  {laboratorio.horarioApertura} – {laboratorio.horarioCierre}
                </span>
              </p>
            </div>

            {/* Contadores de estado inicial de las 20 PCs */}
            <div className={["flex", "gap-3"].join(" ")}>
              {[
                { val: disponibles,   label: "Disponibles", cls: "text-green-700 bg-green-50 border-green-200" },
                { val: enUso,         label: "En uso",       cls: "text-red-700 bg-red-50 border-red-200" },
                { val: mantenimiento, label: "Mtto.",         cls: "text-amber-700 bg-amber-50 border-amber-200" },
              ].map(({ val, label, cls }) => (
                <div
                  key={label}
                  className={["text-center", "rounded-xl", "px-5", "py-3", "border", cls].join(" ")}
                >
                  <p
                    className={["text-2xl", "font-bold", "tabular-nums"].join(" ")}
                    style={{ fontFamily: "DM Mono, monospace" }}
                  >
                    {val}
                  </p>
                  <p className={["text-[9px]", "uppercase", "tracking-widest", "mt-0.5"].join(" ")}>
                    {label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Grid de PCs + Ranking — reutiliza el mismo componente que usa el Director ── */}
      <div>
        <div className={["flex", "items-center", "justify-between", "mb-4"].join(" ")}>
          <h2 className={["text-foreground", "font-medium", "text-sm"].join(" ")}>
            Estado en tiempo real — 20 equipos
          </h2>
          <span
            className={[
              "text-xs", "text-muted-foreground", "bg-secondary",
              "border", "border-border", "px-3", "py-1", "rounded-lg",
            ].join(" ")}
            style={{ fontFamily: "DM Mono, monospace" }}
          >
            Actualización cada 30 s
          </span>
        </div>

        {/* LabPcGrid es el componente compartido con el Director */}
        <LabPcGrid labId={idLab} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. ROOT — <App />
// Gestiona sesión en sessionStorage y enruta entre Login y dashboards.
// ─────────────────────────────────────────────────────────────────────────────

export default function App() {
  const [usuario, setUsuario] = useState<UsuarioWeb | null>(() => {
    try {
      const s = sessionStorage.getItem("lab_usuario");
      return s ? (JSON.parse(s) as UsuarioWeb) : null;
    } catch { return null; }
  });

  // ── Store de clases — sincronizado con Supabase ─────────────────────────
  const [clases,    setClases]    = useState<ClaseRegistro[]>([]);
  const [apiOnline, setApiOnline] = useState(false);
  const [loadingClases, setLoadingClases] = useState(true);

  // Carga inicial: verifica API y obtiene clases desde Supabase
  useEffect(() => {
    let alive = true;
    (async () => {
      const ok = await api.checkHealth();
      if (!alive) return;
      setApiOnline(ok);

      if (ok) {
        const dtos = await api.getClases();
        if (alive) setClases(dtos.map(dtoToClase));
      }
      if (alive) setLoadingClases(false);
    })();
    return () => { alive = false; };
  }, []);

  /**
   * handleNuevaClase — llamado por DocenteDashboard al finalizar una clase.
   * 1. Actualiza el estado local de inmediato (optimistic update → UI reactiva).
   * 2. Persiste en Supabase y notifica al usuario con un toast.
   */
  const handleNuevaClase = useCallback(async (c: ClaseRegistro) => {
    setClases(prev => [c, ...prev]);       // optimistic update inmediato

    if (apiOnline) {
      const ok = await api.saveClase(claseToDTO(c));
      if (ok) {
        toast.success("Clase guardada en Supabase", {
          description: `${c.nombreCurso} · ${c.maquinas.length} equipos · ${c.duracionMinutos ?? 0} min`,
        });
      } else {
        toast.error("No se pudo guardar en Supabase", {
          description: "La clase quedó registrada localmente.",
        });
      }
    } else {
      toast.warning("Sin conexión al servidor", {
        description: "La clase se guardó solo en esta sesión.",
      });
    }
  }, [apiOnline]);

  const handleLogin  = (u: UsuarioWeb) => {
    sessionStorage.setItem("lab_usuario", JSON.stringify(u));
    setUsuario(u);
  };
  const handleLogout = () => {
    sessionStorage.removeItem("lab_usuario");
    setUsuario(null);
  };

  if (!usuario) return <LoginView onLogin={handleLogin} />;

  return (
    <>
      {/* Toast global — posicionado arriba a la derecha */}
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            fontFamily: "DM Sans, sans-serif",
            fontSize: "13px",
            borderRadius: "10px",
            border: "1px solid #e5e5e5",
          },
        }}
      />

      <div className="flex min-h-screen bg-background">
        <Sidebar usuario={usuario} onLogout={handleLogout} apiOnline={apiOnline} />

        <main className="flex-1 overflow-auto">
          {usuario.rol === "DIRECTOR"  && (
            <DirectorDashboard
              clases={clases}
              apiOnline={apiOnline}
              loadingClases={loadingClases}
            />
          )}
          {usuario.rol === "ENCARGADO" && <EncargadoDashboard usuario={usuario} />}
          {usuario.rol === "DOCENTE"   && (
            <DocenteDashboard usuario={usuario} onNuevaClase={handleNuevaClase} />
          )}
        </main>
      </div>
    </>
  );
}
