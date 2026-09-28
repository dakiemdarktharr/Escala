import type { CSSProperties } from "react";

export type IconName =
  | "inbox"
  | "book"
  | "history"
  | "search"
  | "chevron"
  | "close"
  | "check"
  | "shield"
  | "clock"
  | "refresh"
  | "arrow"
  | "info"
  | "menu"
  | "file"
  | "spark"
  | "alert"
  | "box"
  | "edit"
  | "external"
  | "sun"
  | "moon"
  | "monitor"
  | "send";

const paths: Record<IconName, React.ReactNode> = {
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5" /></>,
  moon: <path d="M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z" />,
  monitor: <><rect x="3" y="3" width="18" height="13" rx="2" /><path d="M8 21h8M12 16v5" /></>,
  send: <><path d="m21 3-7 18-4-7-7-4 18-7ZM10 14 21 3" /></>,
  inbox: (
    <>
      <path d="M4 4h16l2 10v6H2v-6L4 4Z" />
      <path d="M2 14h6l2 3h4l2-3h6" />
    </>
  ),
  book: (
    <>
      <path d="M12 5c-3-2-6-2-10-1v15c4-1 7-1 10 1 3-2 6-2 10-1V4c-4-1-7-1-10 1Z" />
      <path d="M12 5v15" />
    </>
  ),
  history: (
    <>
      <path d="M3 11a9 9 0 1 1 2 7M3 3v7h7" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16 16 5 5" />
    </>
  ),
  chevron: <path d="m9 5 7 7-7 7" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  check: <path d="m5 12 4 4L19 6" />,
  shield: (
    <>
      <path d="m12 2 8 3v6c0 5-5 9-8 11-3-2-8-6-8-11V5l8-3Z" />
      <path d="m8 12 3 3 5-6" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 7a9 9 0 0 0-16 2M4 17a9 9 0 0 0 16-2M20 2v6h-6M4 22v-6h6" />
    </>
  ),
  arrow: <path d="m13 5-7 7 7 7M6 12h15" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7h.01" />
    </>
  ),
  menu: <path d="M3 6h18M3 12h18M3 18h18" />,
  file: (
    <>
      <path d="M14 2H5v20h14V7l-5-5Z" />
      <path d="M14 2v6h5M8 12h8M8 16h6" />
    </>
  ),
  spark: (
    <>
      <path d="m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4L12 3Z" />
      <path d="M20 2v4M18 4h4" />
    </>
  ),
  alert: (
    <>
      <path d="m12 3 10 18H2L12 3Z" />
      <path d="M12 9v5M12 17h.01" />
    </>
  ),
  box: (
    <>
      <path d="m12 2 10 5v10l-10 5-10-5V7l10-5Z" />
      <path d="m2 7 10 5 10-5M12 12v10M7 4.5l10 5V14" />
    </>
  ),
  edit: (
    <>
      <path d="m15 4 5 5M4 15 15 4a3.5 3.5 0 0 1 5 5L9 20l-6 1 1-6Z" />
      <path d="M14 21h7" />
    </>
  ),
  external: (
    <>
      <path d="M14 3h7v7M21 3 10 14M10 4H3v17h17v-7" />
    </>
  ),
};

export function Icon({
  name,
  size = 20,
  className = "",
  style,
}: {
  name: IconName;
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
