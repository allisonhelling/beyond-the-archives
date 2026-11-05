import type { Preferences } from './model'

export function animateReadingTurn(element: HTMLElement, mode: Preferences['pageAnimation'], direction: number) {
 if (!mode || mode === 'none' || matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined
 const frames: Keyframe[] = mode === 'curl'
  ? [{ transform: `perspective(1200px) rotateY(${direction * -18}deg)`, transformOrigin: direction > 0 ? 'left center' : 'right center', opacity: .5, boxShadow: 'inset 36px 0 44px #0003' }, { transform: 'perspective(1200px) rotateY(0deg)', opacity: 1, boxShadow: 'inset 0 0 0 #0000' }]
  : [{ transform: `translateX(${direction * 12}%)`, opacity: .5 }, { transform: 'translateX(0)', opacity: 1 }]
 return element.animate(frames, { duration: mode === 'curl' ? 300 : 180, easing: 'ease-out' })
}
