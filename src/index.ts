#!/usr/bin/env node
/* eslint-disable no-console */
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
import Axe, { ElementContext, Spec, RunOptions } from 'axe-core'
import minimist from 'minimist'
import minimatch from 'minimatch'
import chalk from 'chalk'
import ora from 'ora'
import { createRequire } from 'module'
import { errorText } from './constants.js'
import { Result } from './result.js'
import { createMdReport } from './markdownReporter.js'
import { createHtmlReport } from './htmlReporter.js'

const require = createRequire(import.meta.url)
const { getRules } = Axe

interface A11yParameters {
  disable?: boolean
  element?: ElementContext
  config?: Spec
  options?: RunOptions
  manual?: boolean
}

const cpuLength = os.cpus()?.length
if (cpuLength < 2) throw Error('Insufficient cpu')
const supportedOutputFormats = ['md', 'html']
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
  outputFormat = 'md',
} = argv
if (!supportedOutputFormats.includes(outputFormat)) {
  console.error(
    `${chalk.red(
      `ERROR! Incorrect output format passed : ${outputFormat}, supported format are md and html`,
    )}`,
  )
  process.exit(1)
}
const a11yRules = getRules()
const filters = flatten([filter]).reduce((acc: string[], givenId) => {
  if (a11yRules.some((rule) => rule.ruleId === givenId)) return acc.concat(givenId)
  console.log(
    chalk.yellow(`${chalk.red('✗')} Confirm --filter option. A11y ID "${givenId}" is invalid.`),
  )
  return acc
}, [])
const omits = flatten([omit]).reduce((acc: string[], givenId) => {
  if (a11yRules.some((rule) => rule.ruleId === givenId)) return acc.concat(givenId)
  console.log(
    chalk.yellow(`${chalk.red('✗')} Confirm --omit option. A11y ID "${givenId}" is invalid.`),
  )
  return acc
}, [])

const createReport = outputFormat === 'md' ? createMdReport : createHtmlReport

const removeTags = (str: string) => {
  let cleanedString = str

  if (str !== null && str !== '' && str.includes('<')) {
    str = str.toString()
    const removedOpenBracket = str.replace('<', '')
    cleanedString = removedOpenBracket.replace('>', '')
    removeTags(cleanedString)
  }

  return cleanedString
}

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
    spinner1.succeed(`Found ${chalk.green(stories.length.toString())} stories.\n`)
    spinner2.start()
    const workers = await Promise.all(
      [...Array(cpuLength - 1).keys()].map((i) => new StoryPreviewBrowser(connection, i).boot()),
    )
    try {
      if (!stories.length) throw Error('There is no story. Change the conditions and try again.')
      const service = createExecutionService(workers, stories, (story) => async (worker) => {
        await worker.setCurrentStory(story)
        await new MetricsWatcher(worker.page).waitForStable()
        // Add axe-core to page.
        await worker.page.addScriptTag({
          path: require.resolve('axe-core'),
        })
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
          const { element = getElement(), config, options = {}, disable } = getParams(story.id)
          axe.reset()
          if (disable) {
            return null
          }
          if (config) {
            axe.configure(config)
          }
          return axe.run(element, options)
        }, story)
        return (
          runResults?.violations.map((violation) => {
            const cleanDescription = removeTags(violation.description)
            return {
              violationId: violation.id,
              storyId: story.id,
              description: cleanDescription,
            }
          }) || []
        )
      })
      const results = await service.execute()
      const { report, hasViolation } = createReport(
        storybookUrl,
        formatResults(results),
        filters,
        omits,
        include,
        exclude,
      )
      spinner2.stop()
      if (!hasViolation) console.log('✨ ✨ That\'s perfect, there is no a11y violation! ✨ ✨\n')
      await mkdirp(path.resolve(process.cwd(), outDir))
      fs.writeFileSync(`${path.resolve(process.cwd(), outDir)}/a11y_report.${outputFormat}`, report)
      console.log(
        `You can check the report out here:\n    ${chalk.underline.blue(
          `${path.resolve(process.cwd(), `${outDir}/a11y_report.${outputFormat}`)}`,
        )}`,
      )
      if (exit && hasViolation) process.exit(1)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (err: any) {
    spinner1.stop()
    console.error(`${errorText} There is an error about connection:`, err.message)
    process.exit(1)
  }
})()

function filterStories(flatStories: Story[], include: string[], exclude: string[]): Story[] {
  const combined = flatStories.map((s) => ({ ...s, name: s.kind + '/' + s.story }))
  const included = include.length
    ? combined.filter((s) => include.some((rule) => minimatch(s.name, rule)))
    : combined
  const excluded = exclude.length
    ? included.filter((s) => !exclude.some((rule) => minimatch(s.name, rule)))
    : included
  return excluded
}
