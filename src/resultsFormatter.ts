import { Result } from './result'

interface CreateReportMessageFn {
  (storybookUrl: string, violationId: string, violations: Result[]): string
}

export const formatResults = (
  createReportMessage: CreateReportMessageFn,
  storybookUrl: string,
  results: {
    [violationId: string]: Array<Result>
  },
  filters: string[],
  omits: string[],
): { formattedResults: string[]; violationsCount: number } => {
  let violationsCount = 0

  const formattedResults = Object.entries(results)
    .map(([violationId, violations]) => {
      if (filters.length) {
        if (filters.includes(violationId)) {
          violationsCount += violations.length
          return createReportMessage(storybookUrl, violationId, violations)
        }
      }
      if (omits.length) {
        if (!omits.includes(violationId)) {
          violationsCount += violations.length
          return createReportMessage(storybookUrl, violationId, violations)
        }
      }
      // If the "filters" and "omits" are empty, report according to all rules.
      if (!filters.length && !omits.length) {
        violationsCount += violations.length
        return createReportMessage(storybookUrl, violationId, violations)
      }
      return ''
    })
    .filter((violations) => violations)

  return { formattedResults, violationsCount }
}
