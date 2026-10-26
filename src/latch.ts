#!/usr/bin/env node

const yardPath = process.argv[2];

if (yardPath === undefined || yardPath.trim() === "") {
  process.stderr.write(
    "proddle: pass a path to a yard file. this command does not walk or prod yet.\n",
  );
  process.exitCode = 1;
} else {
  process.stdout.write(
    `proddle: noted ${yardPath}. no amble, no prods, no slate yet.\n`,
  );
}
