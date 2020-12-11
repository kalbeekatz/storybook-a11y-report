# storybook-a11y-report

CLI tool for [storybook-addon-a11y](https://github.com/storybookjs/storybook/tree/next/addons/a11y).

## Getting Started

### Prerequisites

If you are already developing in Storybook and storybook-addon-a11y is working, this module will work.
If storybook-addon-a11y is not installed, start with [this guide](https://github.com/storybookjs/storybook/tree/next/addons/a11y#getting-started).

### Installing / Getting started

```sh
# Locally in your project.
npm install -D storybook-a11y-report

# Or globally.
npm install -g storybook-a11y-report

npx storybook-a11y-report
```

## Options

```text
--include, -i   Name of stories to narrow down (supports minimatch)
--exclude, -e   Name of stories to ignore (supports minimatch)
--filter, -f    ID of A11y to narrow down
--omit, -o      ID of A11y to ignore
--exit, -q      The process will be terminated abnormally, if there is an a11y violation in the report result (mainly for CI)
--storybookUrl  URL of Storybook (default: 'http://localhost:6006')
--outDir        Directory to output the report file (default: '__report__')
```

## Built With

- [Storycrawler](https://github.com/reg-viz/storycap/tree/master/packages/storycrawler) - Utilities to build Storybook crawling tools with Puppeteer
- [storybook-addon-a11y](https://github.com/storybookjs/storybook/tree/next/addons/a11y) - Test components for user accessibility in Storybook
- [minimatch](https://github.com/isaacs/minimatch) - A minimal matching utility

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details.
