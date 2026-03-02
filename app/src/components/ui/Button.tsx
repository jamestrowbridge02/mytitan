import React from "react";

type Variant = "default" | "primary" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANT: Record<Variant, string> = {
  default: "mt-btn",
  primary: "mt-btn mt-btn--primary",
  danger: "mt-btn mt-btn--danger",
};

const SIZE: Record<Size, React.CSSProperties> = {
  sm: { padding: "8px 12px", borderRadius: "var(--r-md)" },
  md: { padding: "10px 14px", borderRadius: "var(--r-md)" },
  lg: { padding: "12px 16px", borderRadius: "var(--r-lg)" },
};

export function Button({
  variant = "default",
  size = "md",
  className = "",
  style,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
}) {
  return (
    <button
      {...props}
      className={`${VARIANT[variant]} ${className}`}
      style={{ ...SIZE[size], ...style }}
    />
  );
}
