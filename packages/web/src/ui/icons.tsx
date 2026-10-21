interface IconProps {
  size?: number;
  className?: string;
}

const svg = (path: React.ReactNode, viewBox = '0 0 24 24') =>
  function Icon({ size = 16, className }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox={viewBox}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden="true"
      >
        {path}
      </svg>
    );
  };

export const IconPlus = svg(<><path d="M12 5v14" /><path d="M5 12h14" /></>);
export const IconSearch = svg(<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>);
export const IconSettings = svg(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1.1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1Z" /></>);
export const IconSend = svg(<><path d="M12 19V5" /><path d="m5 12 7-7 7 7" /></>);
export const IconStop = svg(<rect x="7" y="7" width="10" height="10" rx="2" />);
export const IconRefresh = svg(<><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 4v5h-5" /></>);
export const IconChevron = svg(<path d="m6 9 6 6 6-6" />);
export const IconSpark = svg(<><path d="M12 3v4" /><path d="M12 17v4" /><path d="M3 12h4" /><path d="M17 12h4" /><path d="m6 6 2.5 2.5" /><path d="m15.5 15.5 2.5 2.5" /><path d="m18 6-2.5 2.5" /><path d="m8.5 15.5-2.5 2.5" /></>);
export const IconBack = svg(<><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></>);
export const IconShield = svg(<path d="M12 3 5 6v5c0 4.4 2.9 8.4 7 10 4.1-1.6 7-5.6 7-10V6Z" />);
export const IconLogout = svg(<><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="M10 17l-5-5 5-5" /><path d="M5 12h11" /></>);
export const IconWrench = svg(<path d="M14.7 6.3a4 4 0 1 0 5 5L21 21l-3-1-9.4-9.4a4 4 0 0 1-5-5l3.1 3.1 2.1-2.1Z" />);
export const IconChip = svg(<><rect x="7" y="7" width="10" height="10" rx="2" /><path d="M4 10h3M4 14h3M17 10h3M17 14h3M10 4v3M14 4v3M10 17v3M14 17v3" /></>);
export const IconUser = svg(<><circle cx="12" cy="8" r="3.5" /><path d="M5 20c1.6-3.4 4.2-5 7-5s5.4 1.6 7 5" /></>);
export const IconServer = svg(<><rect x="3" y="4" width="18" height="7" rx="2" /><rect x="3" y="13" width="18" height="7" rx="2" /><path d="M7 7.5h.01M7 16.5h.01" /></>);
export const IconPaperclip = svg(
  <path d="M20.5 11.5 12 20a5.5 5.5 0 0 1-7.8-7.8l8.9-8.9a3.7 3.7 0 0 1 5.2 5.2l-8.9 8.9a1.85 1.85 0 0 1-2.6-2.6l8-8" />
);
export const IconX = svg(
  <>
    <path d="m6 6 12 12" />
    <path d="m18 6-12 12" />
  </>
);
export const IconFile = svg(
  <>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
    <path d="M14 3v5h5" />
  </>
);
export const IconCopy = svg(
  <>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M15 6.5V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h1.5" />
  </>
);
export const IconPencil = svg(
  <>
    <path d="M4 20h4l10-10a2.5 2.5 0 0 0-3.5-3.5L4 16.5Z" />
    <path d="m13.5 7 3.5 3.5" />
  </>
);
export const IconDownload = svg(
  <>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </>
);