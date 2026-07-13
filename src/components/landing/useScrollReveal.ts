'use client';

import { useRef } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

type RevealGroup = { selector: string; from?: gsap.TweenVars; stagger?: number };

export function useScrollReveal<T extends HTMLElement = HTMLDivElement>(
  groups: RevealGroup[]
) {
  const ref = useRef<T>(null);

  useGSAP(() => {
    const mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      groups.forEach(({ selector, from, stagger }) => {
        const items = gsap.utils.toArray<HTMLElement>(selector, ref.current);
        items.forEach((el, i) => {
          gsap.from(el, {
            opacity: 0,
            y: 32,
            duration: 0.7,
            ease: 'power2.out',
            delay: stagger ? i * stagger : 0,
            ...from,
            scrollTrigger: {
              trigger: el,
              start: 'top 85%',
              toggleActions: 'play none none none',
            },
          });
        });
      });
    });
    return () => mm.revert();
  }, { scope: ref });

  return ref;
}
