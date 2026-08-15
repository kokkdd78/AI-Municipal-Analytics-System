export function reportTitleFromCategory(category: string): string {
  return category
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`)
    .join(" ")
    .slice(0, 120)
}

export function hasNonblankReportTitle(category: string): boolean {
  return reportTitleFromCategory(category).trim().length > 0
}
