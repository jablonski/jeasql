/** Line icons. Each has its own grid (16 or 24 units) and stroke width. */
const ICONS = {
  menu: { box: 16, stroke: 1.6, paths: () => <path d="M2.5 4h11M2.5 8h11M2.5 12h11" /> },
  folder: {
    box: 16,
    stroke: 1.4,
    paths: () => (
      <>
        <path d="M1.75 12.5V3.75c0-.55.45-1 1-1h3.1l1.5 1.5h4.9c.55 0 1 .45 1 1V6.5" />
        <path d="M1.75 12.5 3.4 7.2c.13-.42.52-.7.96-.7h9.14c.67 0 1.15.65.95 1.3l-1.4 4.5c-.13.42-.52.7-.96.7H2.75c-.55 0-1-.45-1-1Z" />
      </>
    ),
  },
  logout: {
    box: 16,
    stroke: 1.5,
    paths: () => (
      <>
        <path d="M6 2.75H3.75c-.55 0-1 .45-1 1v8.5c0 .55.45 1 1 1H6" />
        <path d="M10.5 11 13.5 8l-3-3M13.5 8H6.5" />
      </>
    ),
  },
  database: {
    box: 24,
    stroke: 1.6,
    paths: () => (
      <>
        <ellipse cx="12" cy="5.5" rx="7.5" ry="2.8" />
        <path d="M4.5 5.5v6.5c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8V5.5" />
        <path d="M4.5 12v6.5c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8V12" />
      </>
    ),
  },
  "not-found": {
    box: 24,
    stroke: 1.6,
    paths: () => (
      <>
        <circle cx="11" cy="11" r="6.5" />
        <path d="m20 20-4.4-4.4M9 9l4 4M13 9l-4 4" />
      </>
    ),
  },
  warning: {
    box: 24,
    stroke: 2,
    paths: () => (
      <path d="M12 9v4m0 4h.01M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
    ),
  },
  question: {
    box: 24,
    stroke: 2,
    paths: () => (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.4m0 3.2h.01" />
      </>
    ),
  },
} satisfies Record<string, { box: number; stroke: number; paths: () => unknown }>;

export type IconName = keyof typeof ICONS;

/** A decorative line icon. Without `size`, CSS sets the size. */
export default function Icon({
  name,
  size,
  class: className,
}: {
  name: IconName;
  size?: number;
  class?: string;
}) {
  const { box, stroke, paths } = ICONS[name];
  return (
    <svg
      class={className}
      viewBox={`0 0 ${box} ${box}`}
      width={size}
      height={size}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      stroke-width={stroke}
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      {paths()}
    </svg>
  );
}
