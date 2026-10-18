import { useId } from 'react'

export type SpineDesign = 'embossed-frame' | 'radiant-ornament' | 'art-deco' | 'library-label' | 'arched' | 'raised-bands' | 'sunburst-fans' | 'plain'

export function SpineDetails({ variant }: { variant: SpineDesign }) {
  const bandGradientId = useId()
  const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, vectorEffect: 'non-scaling-stroke' as const }

  return <svg className="collection-spine-details" viewBox="0 0 150 360" preserveAspectRatio="none" width="100%" height="100%" focusable="false" aria-hidden="true">
    {variant === 'embossed-frame' && <g {...stroke}>
      <path d="M21 35H129V325H21Z" />
      <path d="M27 41H123V319H27Z" strokeWidth=".8" opacity=".75" />
      <path d="M21 55L40 35M110 35L129 55M21 305L40 325M110 325L129 305" />
      <path d="M67 53L75 45L83 53L75 61Z" />
      <path d="M67 307L75 299L83 307L75 315Z" />
    </g>}
    {variant === 'radiant-ornament' && <g {...stroke} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      {[38, 322].map((y, index) => <g key={y} transform={`translate(75 ${y})`}>
        <path d="M-48 0H-13M13 0H48" />
        <path d="M0 -10Q1 -2 8 0Q1 2 0 10Q-1 2 -8 0Q-1 -2 0 -10Z" />
        {index === 0 && <path d="M-12 5L-25 10M-8 11L-12 16M0 14V27M8 11L12 16M12 5L25 10" />}
      </g>)}
    </g>}
    {variant === 'art-deco' && <g {...stroke}>
      <path d="M14 65H29V49H45V35H105V49H121V65H136" />
      <path d="M20 70H34V55H49V42H101V55H116V70H130" strokeWidth=".9" />
      <path d="M14 295H29V311H45V325H105V311H121V295H136" />
      <path d="M20 290H34V305H49V318H101V305H116V290H130" strokeWidth=".9" />
      <path d="M75 55V79M67 59L72 79M83 59L78 79M60 65L69 80M90 65L81 80" strokeWidth="1.2" />
      <path d="M62 83Q75 74 88 83" strokeWidth="1" />
      <path d="M75 305V281M67 301L72 281M83 301L78 281M60 295L69 280M90 295L81 280" strokeWidth="1.2" />
      <path d="M62 277Q75 286 88 277" strokeWidth="1" />
    </g>}
    {variant === 'library-label' && <g {...stroke}>
      <path d="M16 86H134V274H16Z" />
      <path d="M22 92H128V268H22Z" strokeWidth=".9" />
      <path d="M16 105H134M16 255H134" strokeWidth=".8" />
      {['', 'translate(0 360) scale(1 -1)'].map(transform => <g key={transform} transform={transform || undefined}>
        <path d="M75 43L82 52L75 61L68 52Z" strokeWidth="1.2" />
        <path d="M33 52H60M90 52H117M75 32V37M75 67V72" strokeWidth=".9" />
        <path d="M39 60Q50 60 56 66H66M111 60Q100 60 94 66H84" strokeWidth=".8" />
      </g>)}
    </g>}
    {variant === 'arched' && <g {...stroke} strokeLinejoin="round">
      <path d="M20 302V108C20 78 46 57 75 40C104 57 130 78 130 108V302L120 312H30Z" />
      <path d="M27 299V109C27 84 50 65 75 49C100 65 123 84 123 109V299L117 305H33Z" strokeWidth=".8" opacity=".75" />
      <path d="M75 65L81 74L75 83L69 74Z" strokeWidth="1" />
      <path d="M75 279L81 287L75 295L69 287ZM43 287H61M89 287H107" strokeWidth="1" />
    </g>}
    {variant === 'raised-bands' && <g>
      <defs>
        <linearGradient id={bandGradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="black" stopOpacity=".28" />
          <stop offset=".12" stopColor="white" stopOpacity=".22" />
          <stop offset=".3" stopColor="white" stopOpacity=".1" />
          <stop offset=".65" stopColor="black" stopOpacity=".08" />
          <stop offset="1" stopColor="black" stopOpacity=".42" />
        </linearGradient>
      </defs>
      {[73, 269].map(y => <g key={y} transform={`translate(0 ${y})`}>
        <rect x="7" width="136" height="18" rx="2" fill={`url(#${bandGradientId})`} />
        <path d="M10 3H140M10 16H140" {...stroke} strokeWidth=".7" opacity=".55" />
      </g>)}
    </g>}
    {variant === 'sunburst-fans' && <g {...stroke} strokeLinecap="round" strokeLinejoin="round">
      {['translate(0 -16)', 'translate(0 376) scale(1 -1)'].map(transform => <g key={transform} transform={transform || undefined}>
        <path d="M31 100A44 50 0 0 1 119 100Z" strokeWidth="1.3" />
        <path d="M38 100A37 42 0 0 1 112 100" strokeWidth=".7" opacity=".7" />
        <path d="M75 100L34 82M75 100L44 65M75 100L58 54M75 100V50M75 100L92 54M75 100L106 65M75 100L116 82" strokeWidth="1" />
        <path d="M65 100A10 10 0 0 1 85 100" fill="currentColor" strokeWidth=".7" />
        <path d="M75 105L80 111L75 117L70 111Z" strokeWidth="1" />
        <path d="M34 111H61M89 111H116M49 122H101" strokeWidth=".8" />
      </g>)}
    </g>}
  </svg>
}
