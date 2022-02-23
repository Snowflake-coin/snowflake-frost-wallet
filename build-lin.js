const childprocess = require("child_process");
const stream = require('stream');

const runCommand = async (command, backend_builder) => {
  const proc = childprocess.exec(command);

  proc.stdout
    .pipe(
      new stream.Transform({
        transform: (b, _, next) =>
          next(
            null,
            b
              .toString()
              .trim()
              .split(/\n+/g)
              .map((l) => `[${(backend_builder ? 'Wallet Backend Builder' : 'Electron Builder')}] ${l}`)
              .join('\n')
          )
      })
    )
    .on('data', (d) => console.error(d.toString()));

  proc.stderr
    .pipe(
      new stream.Transform({
        transform: (b, _, next) =>
          next(
            null,
            b
              .toString()
              .trim()
              .split(/\n+/g)
              .map((l) => `[${(backend_builder ? 'Wallet Backend Builder' : 'Electron Builder')}] ${l}`)
              .join('\n')
          )
      })
    )
    .on('data', (d) => console.error(d.toString()));

  await new Promise((res) => proc.once('close', (n) => res()));
}

runCommand('./node_modules/.bin/nexe backend-server/index.js -o backend-server/backend-server', true).then(() => runCommand('./node_modules/.bin/electron-builder build --linux'));