// Importa la función para combinar clases CSS.
// Crea un componente Skeleton utilizado como marcador de carga.
// Aplica estilos de animación y apariencia para mostrar un elemento temporal mientras carga contenido.
// Combina los estilos predeterminados con clases personalizadas.
// Exporta el componente Skeleton para reutilizarlo en la aplicación.
import { cn } from "./utils";
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("bg-accent animate-pulse rounded-md", className)}
      {...props}
    />
  );
}
export { Skeleton };
