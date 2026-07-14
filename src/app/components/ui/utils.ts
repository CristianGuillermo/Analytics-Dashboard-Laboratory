// Importa herramientas para combinar clases CSS
//dinámicas y resolver conflictos de Tailwind.
// Función que une varias clases CSS y aplica 
//la última clase de Tailwind cuando existen conflictos.
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
