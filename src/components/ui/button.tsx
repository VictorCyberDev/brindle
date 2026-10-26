import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap transition-[background-color,border-color,color,transform] duration-150 ease-brindle active:translate-y-px disabled:opacity-50 disabled:active:translate-y-0";
const variants: Record<Variant, string> = {
  // Signal is the primary brand action. Ink text keeps contrast at 6.1:1.
  primary: "bg-signal text-signal-on hover:brightness-95 font-semibold",
  secondary: "border border-line-strong text-fg hover:bg-sunken",
  ghost: "text-fg hover:bg-sunken",
  danger: "border border-critical text-critical-text hover:bg-critical-wash",
};
const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-[0.95rem]",
  lg: "h-12 px-6 text-base",
};

export const buttonClass = (variant: Variant = "secondary", size: Size = "md", extra?: string) =>
  cn(base, variants[variant], sizes[size], extra);

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return <button type="button" className={buttonClass(variant, size, className)} {...props} />;
}

export function LinkButton({
  href,
  variant = "secondary",
  size = "md",
  className,
  children,
  ...rest
}: {
  href: string;
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
  "data-testid"?: string;
}) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)} {...rest}>
      {children}
    </Link>
  );
}
