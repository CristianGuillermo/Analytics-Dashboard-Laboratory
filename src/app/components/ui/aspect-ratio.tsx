/*
Este código crea un componente de relación de aspecto usando Radix UI.
Permite mantener proporciones específicas en elementos como imágenes o
contenedores, evitando que cambien su tamaño de forma incorrecta.
*/
"use client";

import * as AspectRatioPrimitive from "@radix-ui/react-aspect-ratio";

function AspectRatio({
  ...props
}: React.ComponentProps<typeof AspectRatioPrimitive.Root>) {
  return <AspectRatioPrimitive.Root data-slot="aspect-ratio" {...props} />;
}

export { AspectRatio };
