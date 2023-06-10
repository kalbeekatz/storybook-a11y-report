#!/bin/bash

npm run build

kill -9 $(lsof -t -i:6006)

# cd examples/v6
# npx http-server storybook-static --port 6006 --silent &
# npx wait-on tcp:6006
# npm run a11y-report
# npm run a11y-report:html
# npm run a11y-report:ignore-specific-rule
# npm run a11y-report:ignore-specific-component
# kill -9 $(lsof -t -i:6006)

# cd ../v6-ignore-globaly
# npx http-server storybook-static --port 6006 --silent &
# npx wait-on tcp:6006
# npm run a11y-report
# npm run a11y-report:html
# kill -9 $(lsof -t -i:6006)

# cd ../v6.4
# npx http-server storybook-static --port 6006 --silent &
# npx wait-on tcp:6006
# npm run a11y-report
# npm run a11y-report:html
# npm run a11y-report:ignore-specific-rule
# npm run a11y-report:ignore-specific-component
# kill -9 $(lsof -t -i:6006)

# cd ../v7
cd examples/v7
npx http-server storybook-static --port 6006 --silent &
npx wait-on tcp:6006
npm run a11y-report
npm run a11y-report:html
npm run a11y-report:ignore-specific-rule
npm run a11y-report:ignore-specific-component
kill -9 $(lsof -t -i:6006)
