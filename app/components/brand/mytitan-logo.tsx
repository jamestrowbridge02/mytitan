import React from "react";

type MyTitanLogoProps = {
  variant?: "full" | "mark" | "wordmark";
  surface?: "light" | "dark";
  size?: "sm" | "md" | "lg";
  glimmer?: boolean;
  animated?: boolean;
  className?: string;
  alt?: string;
};

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

const srcByVariant = {
  full: {
    light: "/brand/mytitan-logo-light.svg",
    dark: "/brand/mytitan-logo-dark.svg",
  },
  mark: {
    light: "/brand/mytitan-mark.svg",
    dark: "/brand/mytitan-mark.svg",
  },
  wordmark: {
    light: "/brand/mytitan-wordmark.svg",
    dark: "/brand/mytitan-wordmark.svg",
  },
} as const;

export default function MyTitanLogo({
  variant = "full",
  surface = "light",
  size = "md",
  glimmer = false,
  animated = false,
  className,
  alt = "MyTitan",
}: MyTitanLogoProps) {
  const shouldAnimate = glimmer || animated;
  return (
    <span
      className={cx(
        "mt-brand-lockup",
        `mt-brand-lockup--${variant}`,
        `mt-brand-lockup--${size}`,
        shouldAnimate && "mt-brand-glimmer",
        className,
      )}
    >
      <img src={srcByVariant[variant][surface]} alt={alt} className="mt-brand-lockup__image" draggable={false} />
    </span>
  );
}
