import React from "react";
import { resolveMediaUrl } from "../../lib/media";

type SafeImageProps = Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src?: string | null;
  fallback?: React.ReactNode;
  wrapperClassName?: string;
  wrapperTestId?: string;
};

export function SafeImage({ src, fallback = null, wrapperClassName, wrapperTestId, onError, ...props }: SafeImageProps) {
  const resolvedSrc = resolveMediaUrl(src);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    setFailed(false);
  }, [resolvedSrc]);

  if (!resolvedSrc || failed) {
    return wrapperClassName || wrapperTestId ? (
      <span className={wrapperClassName} data-testid={wrapperTestId}>
        {fallback}
      </span>
    ) : (
      <>{fallback}</>
    );
  }

  return (
    <img
      {...props}
      src={resolvedSrc}
      onError={(event) => {
        setFailed(true);
        onError?.(event);
      }}
    />
  );
}
