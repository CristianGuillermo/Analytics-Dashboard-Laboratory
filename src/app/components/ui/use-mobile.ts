// Importa React para utilizar estados y efectos en el componente.
// Define el tamaño máximo de pantalla considerado como dispositivo móvil.
// Función que detecta si la aplicación se está ejecutando en un dispositivo móvil.
// Guarda el estado indicando si la pantalla es móvil o no.
// Ejecuta la detección del tamaño de pantalla y actualiza el estado cuando cambia.
// Escucha los cambios en el tamaño de la ventana para actualizar la vista.
// Devuelve un valor booleano indicando si la pantalla corresponde a un dispositivo móvil.
import * as React from "react";

const MOBILE_BREAKPOINT = 768;

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(
    undefined,
  );

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    mql.addEventListener("change", onChange);
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return !!isMobile;
}
