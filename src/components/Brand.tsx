import { BookOpen } from 'lucide-react'
import { brandName, brandTagline } from '../lib/brand'

export function Brand() {
  return <div className="brand"><span className="brand-icon"><BookOpen size={23} strokeWidth={1.6} /></span><span>{brandName.toLowerCase()}<span className="brand-subtitle">{brandTagline}</span></span></div>
}
