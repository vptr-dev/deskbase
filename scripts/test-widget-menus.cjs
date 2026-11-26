const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

// Test the built app using its actual preload, desktop windows and keyboard routing.
if (!process.versions.electron) {
  if (process.platform !== 'win32') throw new Error('Desktop panel tests require Windows.')
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'deskbase-menu-'))
  try {
    const env = { ...process.env, DESKBASE_WIDGET_QA: profile, APPDATA: profile, LOCALAPPDATA: profile }
    delete env.ELECTRON_RUN_AS_NODE
    for (const phase of ['create','restore']) {
      const result = spawnSync(require('electron'), [__filename,'--hidden','--disable-gpu','--user-data-dir='+profile], {
        env:{...env,DESKBASE_QA_PHASE:phase}, stdio:'inherit',windowsHide:true,timeout:105000
      })
      if(result.error)throw result.error
      assert.equal(result.status,0,'Electron checks failed during '+phase)
    }
  } finally {
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 4, retryDelay: 150 })
  }
} else {
  const { app, BrowserWindow } = require('electron')
  const profile = process.env.DESKBASE_WIDGET_QA
  if (!profile) throw new Error('Start the widget checks with Node.')
  for (const key of ['appData', 'userData', 'sessionData', 'logs', 'crashDumps']) {
    const dir = path.join(profile, key)
    fs.mkdirSync(dir, { recursive: true })
    app.setPath(key, dir)
  }
  app.disableHardwareAcceleration()
  require('../out/main/index.js')

  const pause = ms => new Promise(done => setTimeout(done, ms))
  async function waitFor(label, read) {
    for (let attempt = 0; attempt < 150; attempt++) {
      const value = await read()
      if (value) return value
      await pause(100)
    }
    throw new Error('Timed out waiting for ' + label)
  }
  const evaluate = async (win, code) => {
    try { return await win.webContents.executeJavaScript(code) }
    catch (cause) { throw new Error('Renderer command failed in ' + win.getTitle() + ': ' + code, { cause }) }
  }
  async function rightClick(win, selector) {
    const code = 'document.querySelector(' + JSON.stringify(selector) + ').dispatchEvent(new MouseEvent("contextmenu", {bubbles:true,cancelable:true,clientX:24,clientY:22}))'
    await evaluate(win, code)
    await waitFor('styled menu for ' + selector, () => evaluate(win, '!!document.querySelector(".widget-action-popover")'))
  }
  async function choose(win, label) {
    const code = '[...document.querySelectorAll(".widget-action-popover button")].find(b => b.innerText.trim() === ' + JSON.stringify(label) + ').click()'
    try {await evaluate(win,code)} catch(error) {
      console.error('Available actions:',await evaluate(win,'[...document.querySelectorAll(".widget-action-popover button")].map(b=>b.textContent)'));throw error
    }
  }
  async function createPanel(main, type, config) {
    const before = new Set(BrowserWindow.getAllWindows().map(w => w.id))
    const id = await evaluate(main, '__desk.addDesktopWidget(' + JSON.stringify(type) + ',' + JSON.stringify({
      config, x: 32, y: 32, w: 300, h: 220
    }) + ')')
    const win = await waitFor(type + ' window', async () => {
      for(const candidate of BrowserWindow.getAllWindows().filter(w=>!before.has(w.id))){
        if(await evaluate(candidate,'!!document.querySelector(".dw.wt-'+type+'")'))return candidate
      }
    })
    await waitFor(type + ' window to be visible', () => win.isVisible())
    await waitFor(type + ' content', () => evaluate(win, '!!document.querySelector(".dw")'))
    return { id, win }
  }
  async function test() {
    await app.whenReady()
    const main = await waitFor('main window', () => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('/renderer/index.html')))
    await waitFor('app startup', () => evaluate(main, '!!window.__desk'))
    assert.equal(path.dirname(app.getPath('userData')), path.join(profile, 'appData'))

    const expected={x:52,y:70,width:103,height:83}
    if(process.env.DESKBASE_QA_PHASE==='restore'){
      const restored=await waitFor('saved size probe',()=>evaluate(main,'__desk.getData().desktop.widgets.find(w=>w.title==="Size probe")'))
      assert.deepEqual({x:restored.x,y:restored.y,width:restored.w,height:restored.h},expected)
      await waitFor('actual bounds after restart',async()=>{
        const b=await evaluate(main,'__desk.api.desk.bounds('+JSON.stringify(restored.id)+')')
        return b&&Object.keys(expected).every(k=>b[k]===expected[k])
      })
      console.log('Saved and native bounds match after a second Electron launch.');return
    }
    const tasks = await createPanel(main, 'tasks', { filter: 'all', quickAdd: false })
    await rightClick(tasks.win, '.dw')
    await choose(tasks.win, 'Lock panel')
    await waitFor('locked task panel', () => evaluate(tasks.win, '!!document.querySelector(".dw.locked")'))

    await rightClick(tasks.win, '.dw')
    await choose(tasks.win, 'Add a task')
    await waitFor('editable task title', () => evaluate(tasks.win, 'document.activeElement?.classList.contains("quickadd-input")'))
    await tasks.win.webContents.insertText('Water plants weekly')
    tasks.win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' })
    tasks.win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' })
    await waitFor('recurring task', () => evaluate(main, 'Object.values(__desk.getData().tasks).some(t => t.title === "Water plants" && t.repeat === "weekly")'))
    await rightClick(tasks.win, '.task-title')
    assert.deepEqual(await evaluate(tasks.win, '[...document.querySelectorAll(".widget-menu-heading")].map(el => el.innerText)'), ['Water plants', 'Tasks', 'Desktop'])
    tasks.win.setSize(200, 155)
    await waitFor('scrollable compact menu', () => evaluate(tasks.win, `(() => {
      const m = document.querySelector('.widget-action-popover')
      m.scrollTop = m.scrollHeight
      const bounds = m.getBoundingClientRect()
      return m.scrollTop > 0 && bounds.bottom <= innerHeight + 1 && bounds.right <= innerWidth + 1
    })()`))
    await choose(tasks.win, 'Complete')
    await waitFor('completed task', () => evaluate(main, 'Object.values(__desk.getData().tasks).some(t => t.done)'))
    console.log('Locked task entry, item menu and compact scrolling passed.')

    const timer = await createPanel(main, 'timer', { minutes: 5, endsAt: Date.now() + 60000 })
    await rightClick(timer.win, '.dw')
    await choose(timer.win, 'Lock panel')
    await waitFor('locked timer', () => evaluate(timer.win, '!!document.querySelector(".dw.locked")'))
    await rightClick(timer.win, '.dw')
    await choose(timer.win, 'Reset timer')
    await waitFor('reset timer', () => evaluate(main, '__desk.getData().desktop.widgets.find(w => w.id === ' + JSON.stringify(timer.id) + ').config.endsAt === null'))
    console.log('Locked timer reset passed.')
    const probe=await evaluate(main,'__desk.addDesktopWidget("note",{title:"Size probe",x:52,y:70,w:103,h:83})')
    await waitFor('actual bounds before restart',async()=>{
      const b=await evaluate(main,'__desk.api.desk.bounds('+JSON.stringify(probe)+')')
      return b&&Object.keys(expected).every(k=>b[k]===expected[k])
    })
    await evaluate(main,'__desk.api.save(__desk.getData())')
  }
  test().then(() => app.exit(0)).catch(error => {
    console.error(error)
    app.exit(1)
  })
}
