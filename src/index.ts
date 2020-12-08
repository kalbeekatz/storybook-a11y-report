import os from 'os'
import path from 'path'
import fs from 'fs'
import {
  Story,
  StorybookConnection,
  StoriesBrowser,
  StoryPreviewBrowser,
  MetricsWatcher,
  createExecutionService,
} from 'storycrawler'
import { pipe, groupBy, flatten } from 'remeda'
import Axe, { ElementContext, Spec, RunOptions, getRules } from 'axe-core'
import minimist from 'minimist'
import minimatch from 'minimatch'
import colors from 'colors'
import { errorText } from './constants'

type Result = {
  violationId: string
  storyId: string
  description: string
}
interface A11yParameters {
  element?: ElementContext
  config?: Spec
  options?: RunOptions
  manual?: boolean
}

const cpuLength = os.cpus()?.length
if (cpuLength < 2) throw Error('Insufficient cpu')
const argv = minimist(process.argv.slice(2))
const {
  include = [],
  exclude = [],
  filter = [],
  omit = [],
  storybookUrl = 'http://localhost:6006',
} = argv
const a11yRules = getRules()
const filters = flatten([filter]).map((givenId) => {
  if (a11yRules.some((rule) => rule.ruleId === givenId)) return givenId
  console.log(colors.yellow(`Confirm --filter option. A11y ID "${givenId}" is invalid.`))
})
const omits = flatten([omit]).map((givenId) => {
  if (a11yRules.some((rule) => rule.ruleId === givenId)) return givenId
  console.log(colors.yellow(`Confirm --omit option. A11y ID "${givenId}" is invalid.`))
})
const createReportMessage = (violationId: string, violations: Result[]) => {
  return violations
    .sort((a, b) => (a.storyId > b.storyId ? 1 : a.storyId < b.storyId ? -1 : 0))
    .reduce(
      (acc, { storyId }) => (acc += `    ${storybookUrl}/?path=/story/${storyId}\n`),
      `A11y ID: ${violationId}\ndescription: ${violations[0].description}\nDetected on:\n`,
    )
}
const createReport = (
  results: {
    [violationId: string]: Array<Result>
  },
  filters: string[],
  omits: string[],
) =>
  Object.entries(results)
    .map(([violationId, violations]) => {
      if (filters.length) {
        if (filters.includes(violationId)) {
          return createReportMessage(violationId, violations)
        }
      }
      if (omits.length) {
        if (!omits.includes(violationId)) {
          return createReportMessage(violationId, violations)
        }
      }
      // If the "filters" and "omits" are empty, report according to all rules.
      if (!filters.length && !omits.length) {
        return createReportMessage(violationId, violations)
      }
    })
    .join('\n')
const formatResults = (results: Result[][]) => {
  const grouped = pipe(
    flatten(results),
    groupBy((result) => result.violationId),
  )
  const sorted: {
    [violationId: string]: Array<Result>
  } = Object.keys(grouped)
    .sort()
    .reduce((acc, cur) => ({ ...acc, [cur]: grouped[cur] }), {})
  return sorted
}
;(async function () {
  try {
    const connection = await new StorybookConnection({ storybookUrl }).connect()
    const storiesBrowser = await new StoriesBrowser(connection).boot()
    const allStories = await storiesBrowser.getStories()
    const stories = filterStories(allStories, flatten([include]), flatten([exclude]))
    console.log(`Found ${colors.green(stories.length.toString())} stories.\n`)
    const workers = await Promise.all(
      [...Array(cpuLength - 1).keys()].map((i) => new StoryPreviewBrowser(connection, i).boot()),
    )
    try {
      if (!stories.length) throw Error(`There is no story. Change the conditions and try again.`)
      const service = createExecutionService(workers, stories, (story) => async (worker) => {
        await worker.setCurrentStory(story)
        await new MetricsWatcher(worker.page).waitForStable()
        const runResults = await worker.page.evaluate((story) => {
          const getElement = () => {
            return document.getElementById('root') || document
          }
          const getParams = (storyId: string): A11yParameters => {
            // @ts-ignore
            const { parameters } = window['__STORYBOOK_STORY_STORE__'].fromId(storyId) || {}
            return (
              parameters.a11y || {
                config: {},
                options: {},
              }
            )
          }
          // @ts-ignore
          const axe: typeof Axe = window['axe']
          const { element = getElement(), config, options = {} } = getParams(story.id)
          axe.reset()
          if (config) {
            axe.configure(config)
          }
          return axe.run(element, options)
        }, story)
        return runResults.violations.map((violation) => ({
          violationId: violation.id,
          storyId: story.id,
          description: violation.description,
        }))
      })
      const results = await service.execute()
      const report = createReport(formatResults(results), filters, omits)
      if (report) {
        console.log(report)
        fs.writeFileSync(
          'report/a11y_report.md',
          `filtered by: ${filters}\nomit: ${omits}\ninclude: ${include}\nexclude: ${exclude}\n\n` +
            report,
        )
        throw Error(
          `You can check the report out here:\n    ${path.resolve(
            __dirname,
            '../report/a11y_report.md',
          )}`,
        )
      } else {
        console.log(`\n✨ ✨ That's perfect, there is no a11y violation! ✨ ✨`)
      }
    } catch (err) {
      console.error(
        `${errorText} There is an error about the execution of this script:`,
        err.message,
      )
    } finally {
      await storiesBrowser.close()
      await Promise.all(workers.map((worker) => worker.close()))
      await connection.disconnect()
    }
  } catch (err) {
    console.error(`${errorText} There is an error about connection:`, err.message)
  }
})()

function filterStories(flatStories: Story[], include: string[], exclude: string[]): Story[] {
  const conbined = flatStories.map((s) => ({ ...s, name: s.kind + '/' + s.story }))
  const included = include.length
    ? conbined.filter((s) => include.some((rule) => minimatch(s.name, rule)))
    : conbined
  const excluded = exclude.length
    ? included.filter((s) => !exclude.some((rule) => minimatch(s.name, rule)))
    : included
  return excluded
}
