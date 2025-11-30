// preload-dev.js - Dev only, expose Node globals to renderer
if (process.env.NODE_ENV === 'development') {
  window.require = require
  window.module = module
  window.process = process
  window.Buffer = Buffer
  console.log('Preload dev: exposed require/module/process/Buffer to window')
}
