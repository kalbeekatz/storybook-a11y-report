#!/usr/bin/env node
import os from 'os'
import path from 'path'
import fs from 'fs'
import mkdirp from 'mkdirp'
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
import ora from 'ora'
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
const argv = minimist(process.argv.slice(2), {
  alias: {
    i: 'include',
    e: 'exclude',
    f: 'filter',
    o: 'omit',
    q: 'exit',
  },
})
const {
  include = [],
  exclude = [],
  filter = [],
  omit = [],
  storybookUrl = 'http://localhost:6006',
  outDir = '__report__',
  exit,
} = argv
const a11yRules = getRules()
const filters = flatten([filter]).reduce((acc: string[], givenId) => {
  if (a11yRules.some((rule) => rule.ruleId === givenId)) return acc.concat(givenId)
  console.log(
    colors.yellow(`${colors.red('✗')} Confirm --filter option. A11y ID "${givenId}" is invalid.`),
  )
  return acc
}, [])
const omits = flatten([omit]).reduce((acc: string[], givenId) => {
  if (a11yRules.some((rule) => rule.ruleId === givenId)) return acc.concat(givenId)
  console.log(
    colors.yellow(`${colors.red('✗')} Confirm --omit option. A11y ID "${givenId}" is invalid.`),
  )
  return acc
}, [])
const createReportMessage = (violationId: string, violations: Result[]) => {
  return violations
    .sort((a, b) => (a.storyId > b.storyId ? 1 : a.storyId < b.storyId ? -1 : 0))
    .reduce(
      (acc, { storyId }) =>
        (acc += `    ${colors.blue.underline(`${storybookUrl}/?path=/story/${storyId}`)}\n`),
      `${colors.bold(`A11y ID: ${violationId}`)}\ndescription: ${
        violations[0].description
      }\nDetected on:\n`,
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
const spinner1 = ora('now loading storybook...\n')
const spinner2 = ora('now reporting...\n')
;(async function () {
  try {
    spinner1.start()
    const connection = await new StorybookConnection({ storybookUrl }).connect()
    const storiesBrowser = await new StoriesBrowser(connection).boot()
    const allStories = await storiesBrowser.getStories()
    const stories = filterStories(allStories, flatten([include]), flatten([exclude]))
    spinner1.succeed(`Found ${colors.green(stories.length.toString())} stories.\n`)
    spinner2.start()
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
      spinner2.stop()
      if (report) {
        console.log(report)
        await mkdirp(outDir)
        fs.writeFileSync(
          `${outDir}/a11y_report.md`,
          `filter: ${filters}\nomit: ${omits}\ninclude: ${include}\nexclude: ${exclude}\n\n` +
            report,
        )
        console.log(
          `You can check the report out here:\n    ${colors.blue.underline(
            `${path.resolve(__dirname, `../${outDir}/a11y_report.md`)}`,
          )}`,
        )
        if (exit) process.exit(1)
      } else {
        console.log(`\n✨ ✨ That's perfect, there is no a11y violation! ✨ ✨`)
      }
    } catch (err) {
      console.error(
        `${errorText} There is an error about the execution of this script:`,
        err.message,
      )
      process.exit(1)
    } finally {
      spinner1.stop()
      spinner2.stop()
      await storiesBrowser.close()
      await Promise.all(workers.map((worker) => worker.close()))
      await connection.disconnect()
    }
  } catch (err) {
    spinner1.stop()
    console.error(`${errorText} There is an error about connection:`, err.message)
    process.exit(1)
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
