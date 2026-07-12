'use client'

const CREAM = '#E8E2D5'
const CREAM_DIM = 'rgba(232, 226, 213, 0.45)'
const LINE_DIM = 'rgba(255, 255, 255, 0.15)'
const LINE = 'rgba(255, 255, 255, 0.35)'

export default function NavVisual({ variant }: { variant?: string }) {
  return (
    <div
      className="nav-vis-shell relative shrink-0"
      style={{
        width: 56,
        height: 56,
        borderRadius: 8,
        border: '0.5px solid rgba(255,255,255,0.06)',
        background: 'rgba(255,255,255,0.015)',
        overflow: 'hidden',
        transition: 'border-color 240ms ease, background 240ms ease',
      }}
    >
      <Visual variant={variant} />
    </div>
  )
}

function Visual({ variant }: { variant?: string }) {
  switch (variant) {
    case 'assistant':
      return <Assistant />
    case 'vault':
      return <Vault />
    case 'agents':
      return <Agents />
    case 'compliance':
      return <Compliance />
    case 'method':
      return <Method />
    case 'customers':
      return <Customers />
    case 'roi':
      return <Roi />
    case 'security':
      return <Security />
    case 'integrations':
      return <Integrations />
    case 'blog':
      return <Blog />
    case 'about':
      return <About />
    case 'careers':
      return <Careers />
    case 'contact':
      return <Contact />
    case 'press':
      return <Press />
    default:
      return null
  }
}

/* ─── Product ──────────────────────────────────────────────────────── */

function Assistant() {
  return (
    <svg viewBox="0 0 56 56" width="56" height="56" aria-hidden>
      <rect x="8" y="10" width="28" height="12" rx="6" fill="none" stroke={LINE_DIM} strokeWidth="1">
        <animate attributeName="stroke-opacity" values="0.5;1;0.5" dur="1.6s" repeatCount="indefinite" />
      </rect>
      <line x1="14" y1="16" x2="28" y2="16" stroke={CREAM_DIM} strokeWidth="1" strokeLinecap="round" />
      <rect x="20" y="34" width="28" height="12" rx="6" fill="none" stroke={LINE} strokeWidth="1" />
      <circle cx="28" cy="40" r="1.2" fill={CREAM}>
        <animate attributeName="opacity" values="0.3;1;0.3" dur="1.6s" begin="0s" repeatCount="indefinite" />
      </circle>
      <circle cx="34" cy="40" r="1.2" fill={CREAM}>
        <animate attributeName="opacity" values="0.3;1;0.3" dur="1.6s" begin="0.2s" repeatCount="indefinite" />
      </circle>
      <circle cx="40" cy="40" r="1.2" fill={CREAM}>
        <animate attributeName="opacity" values="0.3;1;0.3" dur="1.6s" begin="0.4s" repeatCount="indefinite" />
      </circle>
    </svg>
  )
}

function Vault() {
  return (
    <svg viewBox="0 0 56 56" width="56" height="56" aria-hidden>
      <rect x="14" y="8" width="28" height="40" rx="2" fill="none" stroke={LINE_DIM} strokeWidth="1" />
      {[16, 20, 24, 28, 32, 36, 40].map((y, i) => (
        <line
          key={y}
          x1="18"
          y1={y}
          x2={i % 2 === 0 ? 38 : 34}
          y2={y}
          stroke={CREAM_DIM}
          strokeWidth="0.8"
          strokeLinecap="round"
        >
          <animate
            attributeName="stroke"
            values={`${CREAM_DIM};${CREAM};${CREAM_DIM}`}
            dur="3.2s"
            begin={`${i * 0.4}s`}
            repeatCount="indefinite"
          />
        </line>
      ))}
      <line x1="14" y1="8" x2="42" y2="8" stroke={CREAM} strokeWidth="0.6" opacity="0.7">
        <animateTransform
          attributeName="transform"
          type="translate"
          values="0 0; 0 40; 0 0"
          dur="3.2s"
          repeatCount="indefinite"
        />
      </line>
    </svg>
  )
}

function Agents() {
  // four nodes; pulses traveling along edges; bottom-right is the "you" node (cream)
  return (
    <svg viewBox="0 0 56 56" width="56" height="56" aria-hidden>
      <line x1="16" y1="16" x2="40" y2="16" stroke={LINE_DIM} strokeWidth="0.7" />
      <line x1="16" y1="16" x2="16" y2="40" stroke={LINE_DIM} strokeWidth="0.7" />
      <line x1="40" y1="16" x2="40" y2="40" stroke={LINE_DIM} strokeWidth="0.7" />
      <line x1="16" y1="40" x2="40" y2="40" stroke={LINE_DIM} strokeWidth="0.7" />
      <line x1="16" y1="16" x2="40" y2="40" stroke={LINE_DIM} strokeWidth="0.7" />
      <line x1="40" y1="16" x2="16" y2="40" stroke={LINE_DIM} strokeWidth="0.7" />

      {/* pulses traveling toward the "you" node (40,40) */}
      <circle r="1.2" fill={CREAM}>
        <animateMotion path="M16,16 L40,40" dur="2.4s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0;1;1;0" dur="2.4s" repeatCount="indefinite" />
      </circle>
      <circle r="1.2" fill={CREAM}>
        <animateMotion path="M40,16 L40,40" dur="2.4s" begin="0.6s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0;1;1;0" dur="2.4s" begin="0.6s" repeatCount="indefinite" />
      </circle>
      <circle r="1.2" fill={CREAM}>
        <animateMotion path="M16,40 L40,40" dur="2.4s" begin="1.2s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0;1;1;0" dur="2.4s" begin="1.2s" repeatCount="indefinite" />
      </circle>

      <circle cx="16" cy="16" r="2.5" fill="rgba(255,255,255,0.4)">
        <animate attributeName="opacity" values="0.4;0.8;0.4" dur="2.4s" repeatCount="indefinite" />
      </circle>
      <circle cx="40" cy="16" r="2.5" fill="rgba(255,255,255,0.4)">
        <animate attributeName="opacity" values="0.4;0.8;0.4" dur="2.4s" begin="0.8s" repeatCount="indefinite" />
      </circle>
      <circle cx="16" cy="40" r="2.5" fill="rgba(255,255,255,0.4)">
        <animate attributeName="opacity" values="0.4;0.8;0.4" dur="2.4s" begin="1.6s" repeatCount="indefinite" />
      </circle>
      {/* "you" node */}
      <circle cx="40" cy="40" r="3" fill={CREAM}>
        <animate attributeName="r" values="2.8;3.4;2.8" dur="2.4s" repeatCount="indefinite" />
      </circle>
    </svg>
  )
}

function Compliance() {
  // stack of items being checked off in sequence
  const rows = [12, 22, 32, 42]
  return (
    <svg viewBox="0 0 56 56" width="56" height="56" aria-hidden>
      {rows.map((y, i) => (
        <g key={y}>
          <rect x="10" y={y - 4} width="8" height="8" rx="1.5" fill="none" stroke={LINE_DIM} strokeWidth="0.8" />
          <line x1="22" y1={y} x2="46" y2={y} stroke={CREAM_DIM} strokeWidth="0.8" strokeLinecap="round" />
          <path
            d="M11.5,0 L13.5,2 L17,-2"
            transform={`translate(0 ${y})`}
            fill="none"
            stroke={CREAM}
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="10"
            strokeDashoffset="10"
          >
            <animate
              attributeName="stroke-dashoffset"
              values="10;0;0;10"
              keyTimes="0;0.3;0.85;1"
              dur="4.5s"
              begin={`${i * 0.5}s`}
              repeatCount="indefinite"
            />
          </path>
        </g>
      ))}
    </svg>
  )
}

/* ─── Resources ────────────────────────────────────────────────────── */

function Method() {
  // process flow: dot -> bar -> bar -> dot, pulse traveling left to right
  return (
    <svg viewBox="0 0 56 56" width="56" height="56" aria-hidden>
      <line x1="10" y1="28" x2="46" y2="28" stroke={LINE_DIM} strokeWidth="0.6" />
      <circle cx="10" cy="28" r="2" fill="rgba(255,255,255,0.4)" />
      <rect x="20" y="24" width="6" height="8" rx="1" fill="none" stroke={LINE} strokeWidth="0.7" />
      <rect x="32" y="24" width="6" height="8" rx="1" fill="none" stroke={LINE} strokeWidth="0.7" />
      <circle cx="46" cy="28" r="2" fill={CREAM} />
      <circle r="1.5" fill={CREAM}>
        <animateMotion path="M10,28 L46,28" dur="2.8s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0;1;1;0" dur="2.8s" repeatCount="indefinite" />
      </circle>
    </svg>
  )
}

function Customers() {
  // grid of avatar dots, one pulses cream at a time
  const positions = [
    [14, 14], [28, 14], [42, 14],
    [14, 28], [28, 28], [42, 28],
    [14, 42], [28, 42], [42, 42],
  ]
  return (
    <svg viewBox="0 0 56 56" width="56" height="56" aria-hidden>
      {positions.map(([x, y], i) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="3" fill="rgba(255,255,255,0.18)">
          <animate
            attributeName="fill"
            values={`rgba(255,255,255,0.18);${CREAM};rgba(255,255,255,0.18)`}
            dur="3.6s"
            begin={`${i * 0.4}s`}
            repeatCount="indefinite"
          />
        </circle>
      ))}
    </svg>
  )
}

function Roi() {
  // ascending bars
  const bars = [
    { x: 12, h: 8 },
    { x: 22, h: 14 },
    { x: 32, h: 22 },
    { x: 42, h: 30 },
  ]
  return (
    <svg viewBox="0 0 56 56" width="56" height="56" aria-hidden>
      <line x1="8" y1="44" x2="48" y2="44" stroke={LINE_DIM} strokeWidth="0.6" />
      {bars.map((b, i) => (
        <rect
          key={b.x}
          x={b.x}
          y={44 - b.h}
          width="6"
          height={b.h}
          rx="1"
          fill={i === bars.length - 1 ? CREAM : 'rgba(255,255,255,0.25)'}
        >
          <animate
            attributeName="opacity"
            values="0.4;1;0.4"
            dur="3s"
            begin={`${i * 0.25}s`}
            repeatCount="indefinite"
          />
        </rect>
      ))}
    </svg>
  )
}

function Security() {
  // shield with pulse ring
  return (
    <svg viewBox="0 0 56 56" width="56" height="56" aria-hidden>
      <path
        d="M28 10 L42 16 L42 30 C42 38, 35 44, 28 46 C21 44, 14 38, 14 30 L14 16 Z"
        fill="none"
        stroke={LINE}
        strokeWidth="1"
        strokeLinejoin="round"
      />
      <circle cx="28" cy="28" r="3" fill={CREAM}>
        <animate attributeName="opacity" values="0.5;1;0.5" dur="2.6s" repeatCount="indefinite" />
      </circle>
      <circle cx="28" cy="28" r="3" fill="none" stroke={CREAM} strokeWidth="0.6">
        <animate attributeName="r" values="3;14;3" dur="2.6s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.7;0;0.7" dur="2.6s" repeatCount="indefinite" />
      </circle>
    </svg>
  )
}

function Integrations() {
  // hub with three orbiting nodes
  return (
    <svg viewBox="0 0 56 56" width="56" height="56" aria-hidden>
      <circle cx="28" cy="28" r="14" fill="none" stroke={LINE_DIM} strokeWidth="0.5" strokeDasharray="2 3" />
      <circle cx="28" cy="28" r="3" fill={CREAM} />
      <g>
        <circle cx="42" cy="28" r="2" fill="rgba(255,255,255,0.6)" />
        <animateTransform attributeName="transform" type="rotate" from="0 28 28" to="360 28 28" dur="6s" repeatCount="indefinite" />
      </g>
      <g>
        <circle cx="42" cy="28" r="2" fill="rgba(255,255,255,0.6)" />
        <animateTransform attributeName="transform" type="rotate" from="120 28 28" to="480 28 28" dur="6s" repeatCount="indefinite" />
      </g>
      <g>
        <circle cx="42" cy="28" r="2" fill="rgba(255,255,255,0.6)" />
        <animateTransform attributeName="transform" type="rotate" from="240 28 28" to="600 28 28" dur="6s" repeatCount="indefinite" />
      </g>
    </svg>
  )
}

function Blog() {
  // document with scrolling lines
  return (
    <svg viewBox="0 0 56 56" width="56" height="56" aria-hidden>
      <rect x="14" y="10" width="28" height="36" rx="2" fill="none" stroke={LINE} strokeWidth="0.8" />
      <line x1="18" y1="18" x2="34" y2="18" stroke={CREAM} strokeWidth="0.9" strokeLinecap="round" />
      {[24, 28, 32, 36, 40].map((y, i) => (
        <line key={y} x1="18" y1={y} x2={i % 2 === 0 ? 38 : 32} y2={y} stroke={CREAM_DIM} strokeWidth="0.7" strokeLinecap="round">
          <animate attributeName="opacity" values="0.3;0.9;0.3" dur="3.4s" begin={`${i * 0.3}s`} repeatCount="indefinite" />
        </line>
      ))}
    </svg>
  )
}

/* ─── Company ──────────────────────────────────────────────────────── */

function About() {
  // building silhouette w/ window pulse
  return (
    <svg viewBox="0 0 56 56" width="56" height="56" aria-hidden>
      <rect x="14" y="14" width="28" height="32" fill="none" stroke={LINE} strokeWidth="0.9" />
      {[20, 28, 36].map((y) =>
        [18, 26, 34].map((x, i) => (
          <rect key={`${x}-${y}`} x={x} y={y} width="4" height="4" fill={CREAM_DIM}>
            <animate
              attributeName="fill"
              values={`${CREAM_DIM};${CREAM};${CREAM_DIM}`}
              dur="4s"
              begin={`${(y + i) * 0.15}s`}
              repeatCount="indefinite"
            />
          </rect>
        ))
      )}
    </svg>
  )
}

function Careers() {
  // briefcase with notch
  return (
    <svg viewBox="0 0 56 56" width="56" height="56" aria-hidden>
      <rect x="10" y="20" width="36" height="22" rx="2" fill="none" stroke={LINE} strokeWidth="0.9" />
      <path d="M22 20 L22 16 L34 16 L34 20" fill="none" stroke={LINE} strokeWidth="0.9" />
      <line x1="10" y1="30" x2="46" y2="30" stroke={CREAM_DIM} strokeWidth="0.6" />
      <rect x="25" y="28" width="6" height="4" rx="0.5" fill={CREAM}>
        <animate attributeName="opacity" values="0.5;1;0.5" dur="2.8s" repeatCount="indefinite" />
      </rect>
    </svg>
  )
}

function Contact() {
  // envelope with radio waves
  return (
    <svg viewBox="0 0 56 56" width="56" height="56" aria-hidden>
      <rect x="12" y="20" width="32" height="20" rx="2" fill="none" stroke={LINE} strokeWidth="0.9" />
      <path d="M12 22 L28 32 L44 22" fill="none" stroke={CREAM_DIM} strokeWidth="0.9" />
      <circle cx="44" cy="20" r="2" fill={CREAM}>
        <animate attributeName="opacity" values="0.4;1;0.4" dur="2.2s" repeatCount="indefinite" />
      </circle>
      <circle cx="44" cy="20" r="3" fill="none" stroke={CREAM} strokeWidth="0.6">
        <animate attributeName="r" values="3;8;3" dur="2.2s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.7;0;0.7" dur="2.2s" repeatCount="indefinite" />
      </circle>
    </svg>
  )
}

function Press() {
  // stacked papers, top sheet shifting
  return (
    <svg viewBox="0 0 56 56" width="56" height="56" aria-hidden>
      <rect x="12" y="16" width="28" height="32" rx="1.5" fill="none" stroke={LINE_DIM} strokeWidth="0.7" />
      <rect x="16" y="12" width="28" height="32" rx="1.5" fill="none" stroke={LINE} strokeWidth="0.9" />
      <line x1="20" y1="20" x2="40" y2="20" stroke={CREAM} strokeWidth="0.9" strokeLinecap="round" />
      {[26, 30, 34, 38].map((y, i) => (
        <line key={y} x1="20" y1={y} x2={i % 2 === 0 ? 40 : 34} y2={y} stroke={CREAM_DIM} strokeWidth="0.7" strokeLinecap="round">
          <animate attributeName="opacity" values="0.3;0.8;0.3" dur="3.8s" begin={`${i * 0.4}s`} repeatCount="indefinite" />
        </line>
      ))}
    </svg>
  )
}
