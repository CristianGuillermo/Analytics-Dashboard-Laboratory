// Indica que el componente se ejecuta en el lado del cliente.
// Importa React y el componente Separator de Radix UI.
// Importa la función para combinar clases CSS.
// Crea un separador visual horizontal o vertical con estilos personalizados.
// Permite configurar la orientación y si el separador es decorativo.
// Combina estilos predeterminados con clases adicionales.
// Exporta el componente Separator para reutilizarlo en la aplicación.
"use client";

import * as React from "react";
import * as SeparatorPrimitive from "@radix-ui/react-separator";

import { cn } from "./utils";

function Separator({
  className,
  orientation = "horizontal",
  decorative = true,
  ...props
}: React.ComponentProps<typeof SeparatorPrimitive.Root>) {
  return (
    <SeparatorPrimitive.Root
      data-slot="separator-root"
      decorative={decorative}
      orientation={orientation}
      className={cn(
        "bg-border shrink-0 data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px",
        className,
      )}
      {...props}
    />
  );
}

export { Separator };
