import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "rounded-md bg-[color-mix(in_oklch,var(--ink),transparent_90%)]",
        // motion-safe, because a pulse behind every cell of a full table is a lot
        // of movement for anyone who asked the OS for less of it.
        "motion-safe:animate-pulse",
        className
      )}
      {...props}
    />
  )
}

export { Skeleton }
