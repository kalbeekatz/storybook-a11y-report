import { Result } from './result'
import { formatResults } from './resultsFormatter'

const createHtmlReportMessage = (
  storybookUrl: string,
  violationId: string,
  violations: Result[],
) => {
  const formattedViolation = violations
    .sort((a, b) => (a.storyId > b.storyId ? 1 : a.storyId < b.storyId ? -1 : 0))
    .reduce(
      (acc, { storyId }) =>
        (acc += `<li><a href="${storybookUrl}/?path=/story/${storyId}" target="_blank">${storyId}</a></li>`),
      `<h3>A11y ID: ${violationId}</h3><p>Description: ${violations[0].description}<p>Detected on:<br/><ul>`,
    )

  return `${formattedViolation}</ul>`
}

export const createHtmlReport = (
  storybookUrl: string,
  results: {
    [violationId: string]: Array<Result>
  },
  filters: string[],
  omits: string[],
  include: string[],
  exclude: string[],
) => {
  const title = '<h1>Accessibility report</h1>'
  const commandOptions = `<ul><li>filter: ${filters}</li><li>omit: ${omits}</li><li>include: ${include}</li><li>exclude: ${exclude}</li></ul>`
  const { formattedResults, violationsCount } = formatResults(
    createHtmlReportMessage,
    storybookUrl,
    results,
    filters,
    omits,
  )
  const details = formattedResults.length
    ? `<h2>${violationsCount} violations have been found</h2>${formattedResults.join('')}`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
    <head>
        <meta charset="utf-8">
        <title>Accessibility report</title>
    </head>
    <body>
        ${title}${commandOptions}${details}
    </body>
</html>`
}
