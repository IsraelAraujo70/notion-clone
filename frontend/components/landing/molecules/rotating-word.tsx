"use client"

import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useEffect, useState } from "react"

import { useI18n } from "@/lib/i18n/i18n-provider"
import type { Message } from "@/lib/i18n/messages"

const WORDS = [
  "become",
  "fill",
  "grow into",
  "turn into",
] as const satisfies readonly Message[]

const WORD_STYLES = [
  "bg-[#cdf4d6] text-[#0f7b2d] dark:bg-[#204b2b] dark:text-[#a6efb6]",
  "bg-[#dbeafe] text-[#1d4fa1] dark:bg-[#1e3357] dark:text-[#a9ccf8]",
  "bg-[#fdeccd] text-[#8a5a00] dark:bg-[#4a380f] dark:text-[#f5d38a]",
  "bg-[#ecdefb] text-[#6b35a8] dark:bg-[#3a2354] dark:text-[#d3b3f5]",
] as const

const ROTATION_MS = 2400

export function RotatingWord() {
  const { t } = useI18n()
  const reducedMotion = useReducedMotion()
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (reducedMotion) return
    const interval = window.setInterval(() => {
      setIndex((current) => (current + 1) % WORDS.length)
    }, ROTATION_MS)
    return () => window.clearInterval(interval)
  }, [reducedMotion])

  if (reducedMotion) {
    return (
      <span
        className={`inline-flex rounded-full px-4 py-1 ${WORD_STYLES[0]}`}
      >
        {t(WORDS[0])}
      </span>
    )
  }

  return (
    <motion.span
      layout="size"
      className={`inline-flex overflow-hidden rounded-full align-baseline transition-colors duration-500 ${WORD_STYLES[index]}`}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={WORDS[index]}
          initial={{ y: "70%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "-70%", opacity: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 30 }}
          className="inline-block px-4 py-1 whitespace-nowrap"
        >
          {t(WORDS[index])}
        </motion.span>
      </AnimatePresence>
    </motion.span>
  )
}
