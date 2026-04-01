"use client";

import Link, { type LinkProps } from "next/link";
import { track } from "@vercel/analytics";

type TrackedLinkProps = LinkProps &
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
    eventName: string;
    eventData?: Record<string, string | number | boolean>;
  };

export function TrackedLink({
  eventName,
  eventData,
  onClick,
  children,
  ...props
}: TrackedLinkProps) {
  return (
    <Link
      {...props}
      prefetch={props.prefetch ?? true}
      onClick={(event) => {
        track(eventName, eventData);
        onClick?.(event);
      }}
    >
      {children}
    </Link>
  );
}
