// Indica que el componente se ejecuta en el lado del cliente.
// Importa el sistema de temas y el componente de notificaciones de Sonner.
// Crea un componente Toaster para mostrar mensajes emergentes.
// Obtiene el tema actual de la aplicación para adaptar el estilo de las notificaciones.
// Configura los colores y propiedades del Toaster según el tema seleccionado.
// Exporta el componente Toaster para utilizarlo en la aplicación.
"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner, ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
