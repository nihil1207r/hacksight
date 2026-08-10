import { forwardRef } from "react";
import { cn } from "@/lib/utils";

export const Card = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  function Card({ children, className, style, ...rest }, ref) {
    return (
      <div ref={ref} className={cn("glass", className)} style={style} {...rest}>
        {children}
      </div>
    );
  }
);