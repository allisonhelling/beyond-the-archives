
import type { ComponentType, SVGProps } from 'react'

import EmbossedFrame from '../assets/spine_designs/embossed_frame.svg?react'
import RadiantOrnament from '../assets/spine_designs/radiant_ornament.svg?react'
import ArtDeco from '../assets/spine_designs/art_deco.svg?react'
import LibraryLabel from '../assets/spine_designs/library_label.svg?react'
import Arched from '../assets/spine_designs/arched.svg?react'
import RaisedBands from '../assets/spine_designs/raised_bands.svg?react'
import SunburstFans from '../assets/spine_designs/sunburst_fans.svg?react'
import Celestial from '../assets/spine_designs/celestial.svg?react'
import Constellation from '../assets/spine_designs/constellation.svg?react'
import InterlockingCircles from '../assets/spine_designs/interlocking_circles.svg?react'
import LinkedDiamonds from '../assets/spine_designs/linked_diamonds.svg?react'
import BookStack from '../assets/spine_designs/book_stack.svg?react'
import DecoCrest from '../assets/spine_designs/deco_crest.svg?react'
import LibraryDeco from '../assets/spine_designs/library_deco.svg?react'
import StarTrails from '../assets/spine_designs/star_trails.svg?react'
import StarTrailsCascading from '../assets/spine_designs/star_trails_cascading.svg?react'
import StarTrailsExtended from '../assets/spine_designs/star_trails_extended.svg?react'
import VerticalDiamonds from '../assets/spine_designs/vertical_diamonds.svg?react'
import LunarPhases from '../assets/spine_designs/lunar_phases.svg?react'
import QueryCrown from '../assets/spine_designs/query_crown.svg?react'


export type SpineDesign =
  | 'embossed-frame'
  | 'radiant-ornament'
  | 'art-deco'
  | 'library-label'
  | 'arched'
  | 'raised-bands'
  | 'sunburst-fans'
  | 'plain'
  | 'celestial'
  | 'constellation'
  | 'interlocking-circles'
  | 'linked-diamonds'
  | 'book-stack'
  | 'deco-crest'
  | 'library-deco'
  | 'star-trails'
  | 'star-trails-cascading'
  | 'star-trails-extended'
  | 'vertical-diamonds'
  | 'lunar-phases'
  | 'query-crown'

const designs: Partial<
  Record<SpineDesign, ComponentType<SVGProps<SVGSVGElement>>>
> = {
  'embossed-frame': EmbossedFrame,
  'radiant-ornament': RadiantOrnament,
  'art-deco': ArtDeco,
  'library-label': LibraryLabel,
  'arched': Arched,
  'raised-bands': RaisedBands,
  'sunburst-fans': SunburstFans,
  'celestial': Celestial,
  'constellation': Constellation,
  'interlocking-circles': InterlockingCircles,
  'linked-diamonds': LinkedDiamonds,
  'book-stack': BookStack,
  'deco-crest': DecoCrest,
  'library-deco': LibraryDeco,
  'star-trails': StarTrails,
  'star-trails-cascading': StarTrailsCascading,
  'star-trails-extended': StarTrailsExtended,
  'vertical-diamonds': VerticalDiamonds,
  'lunar-phases': LunarPhases,
  'query-crown': QueryCrown,
}

export function SpineDetails({ variant }: { variant: SpineDesign }) {
  const Design = designs[variant]

  if (!Design) return null

  return (
    <Design
      className="collection-spine-details"
      width="100%"
      height="100%"
      preserveAspectRatio="none"
      focusable="false"
      aria-hidden="true"
    />
  )
}
