#!/bin/bash
NODE_OPTIONS="--loader=file://$(realpath ./node_modules/ts-node/esm.mjs) --no-warnings" \
npx mocha -t 1000000 tests/**/*.ts

