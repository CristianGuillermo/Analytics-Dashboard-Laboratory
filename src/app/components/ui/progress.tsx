// Crea un componente de barra de progreso usando React y Radix UI.
// Permite mostrar visualmente el avance de una tarea mediante un porcentaje.
// Calcula la posición del indicador según el valor recibido.
// Aplica estilos y animaciones para representar el progreso.
// Combina estilos predeterminados con clases CSS personalizadas.
// Exporta el componente Progress para reutilizarlo en la aplicación.
"use client";

import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";

import { cn } from "./utils";

function Progress({
  className,
  value,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn(
        "bg-primary/20 relative h-2 w-full overflow-hidden rounded-full",
        className,
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className="bg-primary h-full w-full flex-1 transition-all"
        style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  );
}

export { Progress };
