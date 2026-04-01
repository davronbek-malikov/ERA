import { cn } from "@/lib/utils";

type EraLogoProps = {
  className?: string;
};

export function EraLogo({ className }: EraLogoProps) {
  return (
    <svg
      viewBox="0 0 220 220"
      role="img"
      aria-label="ERA Academy logo"
      className={cn("h-12 w-12", className)}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="era-head" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0f63b5" />
          <stop offset="100%" stopColor="#0b4b95" />
        </linearGradient>
        <linearGradient id="era-bulb" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffd35a" />
          <stop offset="100%" stopColor="#ff9d00" />
        </linearGradient>
        <linearGradient id="era-orbit" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#ffbf3f" />
          <stop offset="100%" stopColor="#ff8b00" />
        </linearGradient>
      </defs>

      <path
        d="M42 155c14-11 19-22 19-35V88c0-33 26-58 60-58 34 0 60 25 60 58 0 19-6 33-18 44-8 8-13 17-16 28l-6 20c-2 7-9 12-16 12H97c-7 0-13-5-15-11l-6-17c-4-11-9-18-19-25-9-6-16-14-15-19Z"
        fill="url(#era-head)"
      />
      <path
        d="M72 102c11-10 24-16 41-16 24 0 44 11 61 31-20 8-44 12-73 12-15 0-29-2-43-5 3-9 7-16 14-22Z"
        fill="#fff"
        opacity=".15"
      />

      <ellipse cx="108" cy="95" rx="39" ry="47" fill="white" />
      <path
        d="M108 48c-20 0-36 21-36 46 0 19 9 31 23 40v11h26v-11c14-8 23-21 23-40 0-25-16-46-36-46Z"
        fill="url(#era-bulb)"
      />
      <path
        d="M108 67c8 0 15 6 15 14 0 4-2 9-5 12-2 2-4 4-4 8v1h-12v-1c0-4-2-6-4-8-3-3-5-8-5-12 0-8 7-14 15-14Z"
        fill="#fff6d7"
      />
      <rect x="92" y="146" width="32" height="12" rx="6" fill="#1e5aa6" />
      <rect x="95" y="158" width="26" height="9" rx="4.5" fill="#1a4f92" />

      <path
        d="M41 144c34 6 83 5 124-6 15-4 28-10 38-18-9 15-24 28-46 37-42 17-96 18-136 4-9-3-16-7-21-11 12-5 25-7 41-6Z"
        fill="url(#era-orbit)"
      />

      <g transform="translate(138 26) rotate(18)">
        <path d="M17 0c12 6 22 17 28 32-8-1-18-6-28-14C9 28 0 34 0 34 2 20 8 8 17 0Z" fill="#e51a1a" />
        <path d="M24 10c17 7 31 21 37 42-11-2-24-10-37-20-10 12-21 20-21 20 3-18 10-31 21-42Z" fill="white" stroke="#d0d7e2" strokeWidth="3" />
        <ellipse cx="34" cy="31" rx="7" ry="7" fill="#0f63b5" />
        <path d="M24 52c-3 10-8 18-17 25 1-10 4-18 10-26Z" fill="#e51a1a" />
        <path d="M17 51c-1 12-6 23-15 33 12-1 22-6 31-15Z" fill="#ff9d00" />
        <path d="M8 24 0 17c6-3 12-4 19-2Z" fill="#e51a1a" />
        <path d="m52 42 10 8c-7 2-13 2-19-1Z" fill="#e51a1a" />
      </g>

      <circle cx="162" cy="88" r="4" fill="#ffb300" />
      <circle cx="176" cy="104" r="5" fill="#0f63b5" />
      <circle cx="149" cy="111" r="4" fill="#0f63b5" />
    </svg>
  );
}
