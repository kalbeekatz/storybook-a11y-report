import { Result } from './result'
import { formatResults } from './resultsFormatter'

const createMdReportMessage = (storybookUrl: string, violationId: string, violations: Result[]) => {
  return violations
    .sort((a, b) => (a.storyId > b.storyId ? 1 : a.storyId < b.storyId ? -1 : 0))
    .reduce(
      (acc, { storyId }) => (acc += `- [${storyId}](${storybookUrl}/?path=/story/${storyId}\n)`),
      `### A11y ID: ${violationId}\nDescription: ${violations[0].description}\n\nDetected on:\n`,
    )
}
export const createMdReport = (
  storybookUrl: string,
  results: {
    [violationId: string]: Array<Result>
  },
  filters: string[],
  omits: string[],
  include: string[],
  exclude: string[],
) => {
  const title = '# Accessibility report\n'
  const commandOptions = `- filter: ${filters}\n- omit: ${omits}\n- include: ${include}\n- exclude: ${exclude}\n\n`
  const { formattedResults, violationsCount } = formatResults(
    createMdReportMessage,
    storybookUrl,
    results,
    filters,
    omits,
  )
  const details = formattedResults.length
    ? `## ${violationsCount} violations have been found\n${formattedResults.join('\n\n')}`
    : ''

  return `${title}${commandOptions}${details}`
}
