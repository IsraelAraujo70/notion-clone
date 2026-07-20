import { cn } from "@/lib/utils"

const INK = "#37352f"

function FaceBase({ children }: { children: React.ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 48 48"
      className="size-full"
      fill="none"
    >
      <g stroke={INK} strokeWidth="2" strokeLinecap="round">
        <circle cx="24" cy="27" r="11" fill="#ffffff" />
        {children}
      </g>
    </svg>
  )
}

function Eyes() {
  return (
    <g fill={INK} stroke="none">
      <circle cx="20" cy="26.5" r="1.3" />
      <circle cx="28" cy="26.5" r="1.3" />
    </g>
  )
}

function CropHairFace() {
  return (
    <FaceBase>
      <path d="M13.5 25C14 17.5 34 17.5 34.5 25" />
      <Eyes />
      <path d="M24 27v3" />
      <path d="M20 31.5Q24 34.5 28 31.5" />
    </FaceBase>
  )
}

function GlassesFace() {
  return (
    <FaceBase>
      <path d="M14.5 21.5a3.2 3.2 0 0 1 6.3 -1.2 3.2 3.2 0 0 1 6.4 0 3.2 3.2 0 0 1 6.3 1.2" />
      <circle cx="20" cy="26" r="3" fill="#ffffff" />
      <circle cx="28" cy="26" r="3" fill="#ffffff" />
      <path d="M23 26h2" />
      <path d="M17 25.5L14 25M31 25.5L34 25" />
      <g fill={INK} stroke="none">
        <circle cx="20" cy="26" r="1" />
        <circle cx="28" cy="26" r="1" />
      </g>
      <path d="M21 32Q24 34 27 32" />
    </FaceBase>
  )
}

function BobFace() {
  return (
    <FaceBase>
      <path d="M13 27C13 15.5 35 15.5 35 27v3.5" />
      <path d="M13 27v3.5" />
      <path d="M14 22.5C17 19 31 19 34 22.5" />
      <Eyes />
      <path d="M17.8 24.5l-1.6 -1.6M30.2 24.5l1.6 -1.6" />
      <path d="M20.5 31.5Q24 34 27.5 31.5" />
    </FaceBase>
  )
}

function BunFace() {
  return (
    <FaceBase>
      <circle cx="24" cy="13.5" r="3" fill="#ffffff" />
      <path d="M14 23C15 16.5 33 16.5 34 23" />
      <Eyes />
      <g fill={INK} stroke="none">
        <circle cx="17.3" cy="29" r="0.7" />
        <circle cx="30.7" cy="29" r="0.7" />
      </g>
      <path d="M20.5 31Q24 35.5 27.5 31" />
    </FaceBase>
  )
}

function FringeBeardFace() {
  return (
    <FaceBase>
      <path d="M14.5 23C15 16.5 33 16.5 33.5 23l-2 -2.5 -2 2.5 -2.5 -3 -3 3 -2.5 -3 -2 3 -2 -2.5z" />
      <Eyes />
      <path d="M17.5 31C19 36.5 29 36.5 30.5 31" />
      <path d="M21.5 30.5Q24 32 26.5 30.5" />
    </FaceBase>
  )
}

const FACES = [
  { Face: CropHairFace, ring: "#4c8bf5", tilt: "-rotate-6" },
  { Face: GlassesFace, ring: "#f0653a", tilt: "rotate-3" },
  { Face: BobFace, ring: "#f6c344", tilt: "-rotate-2" },
  { Face: BunFace, ring: "#3aa655", tilt: "rotate-6" },
  { Face: FringeBeardFace, ring: "#9b6dd7", tilt: "-rotate-3" },
] as const

export function MiniFaces() {
  return (
    <div aria-hidden="true" className="flex justify-center -space-x-2">
      {FACES.map(({ Face, ring, tilt }) => (
        <span
          key={ring}
          className={cn(
            "size-12 overflow-hidden rounded-full border-2 bg-white shadow-sm transition-transform duration-300 hover:-translate-y-1",
            tilt
          )}
          style={{ borderColor: ring }}
        >
          <Face />
        </span>
      ))}
    </div>
  )
}
