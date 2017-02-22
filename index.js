const fork = require('child_process').fork
const tapSpec = require('tap-spec')
const glob = require('glob')
const path = require('path')
const Readable = require('stream').Readable
const uniq = require('uniq')

const cpus = require('os').cpus().length * 2

function Bogota (paths) {
  let codes = 0
  let pending = 0

  const s = new Readable()
  s._read = () => {}
  s.pipe(tapSpec()).pipe(process.stdout)

  let fileList = []

  paths.forEach(path => {
    const pathFiles = glob.sync(path)
    if (pathFiles.length > 0) fileList = fileList.concat(pathFiles)
  })

  uniq(fileList)

  let childsToRun = Math.min(cpus, fileList.length)
  let childs = []

  for (let i = 0; i < childsToRun; i++) {
    pending++
    runFork()
  }

  process.on('exit', code => {
    process.exit(code || codes)
  })

  function disconnectChilds () {
    childs.forEach(child => {
      child.connected && child.disconnect()
    })
  }

  function runFork () {
    const child = fork(path.resolve(__dirname) + '/child.js', [], {stdio: [null, null, null, 'ipc']})
    childs.push(child)
    let data = []
    child.stdout.on('data', d => {
      if (data.length > 0 && d.includes('#')) {
        if (fileList.length) {
          child.send(fileList.pop())
        } else {
          disconnectChilds()
        }
        s.push(data.join(''))
        data = []
      }
      data.push(d)
    })

    child.stderr.on('data', err => {
      console.error(err.toString())
    })

    child.on('error', e => {
      console.error('ERROR', e)
    })

    child.on('exit', code => {
      s.push(data.join(''))
      codes = codes || code
      if (--pending === 0) s.push(null)
    })

    child.send(fileList.pop())

    setTimeout(() => {
      child.connected && child.disconnect()
    }, 60000).unref()
  }
}

module.exports = Bogota
