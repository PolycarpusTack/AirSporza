function toDateStr(d: Date | string | undefined): string {
  if (!d) return ''
  if (typeof d === 'string') return d
  return d.toISOString().split('T')[0]
}

export const fmtDate = (d: Date | string | undefined): string => {
  const str = toDateStr(d)
  if (!str) return "—"
  const [y, m, day] = str.split("-")
  return `${day}/${m}/${y}`
}

export const dayLabel = (d: Date | string): string => {
  const str = toDateStr(d)
  if (!str) return "—"
  return new Date(str + "T00:00:00").toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long"
  })
}

export const daysUntil = (d: Date | string | undefined): number => {
  const str = toDateStr(d)
  if (!str) return Infinity
  return Math.ceil((new Date(str).getTime() - Date.now()) / (86400000))
}

export const genId = (): number => Date.now() + Math.floor(Math.random() * 1000)
