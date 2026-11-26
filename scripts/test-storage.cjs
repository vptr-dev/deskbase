const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const Module = require('node:module')
const esbuild = require('esbuild')

async function test() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'deskbase-storage-'))
  try {
    const built = await esbuild.build({
      stdin: { contents: "export * from './src/main/storage'; export * from './src/main/vault'; export * from './src/main/history'", resolveDir: process.cwd() },
      write: false, bundle: true, platform: 'node', format: 'cjs', external: ['electron']
    })
    function restart() {
      const entry = new Module('workspace-qa', module)
      entry.require = id => id === 'electron' ? { app: { getPath: () => profile } } : require(id)
      entry._compile(built.outputFiles[0].text, 'workspace-qa.cjs')
      return entry.exports
    }
    let store = restart()
    const dir = store.dataDir(), password = 'qa-only-password'
    const photo = 'data:image/png;base64,' + 'A'.repeat(90000)
    const sample = { schema: 21, pages: { bio: { title: 'Biology QA', cover: photo } } }
    fs.writeFileSync(store.dataFile(), JSON.stringify(sample))
    assert.equal(store.loadData().migratedFrom,21)
    store.saveData(sample)
    assert.ok(!fs.readFileSync(store.dataFile(),'utf8').includes(photo))
    const backup = store.createBackup('qa')
    await store.saveVersion('bio', { at: Date.now(), title: 'Biology QA', icon: '', blocks: [] })
    assert.equal(store.readBackup(backup).pages.bio.cover, photo)
    store.setProtection(dir,password,'enable')
    assert.ok(!fs.readFileSync(store.dataFile(),'utf8').includes('Biology QA'))
    assert.ok(!fs.readFileSync(path.join(dir,'history','bio.json'),'utf8').includes('Biology QA'))
    store = restart()
    assert.throws(()=>store.loadData(), /locked/)
    assert.throws(()=>store.saveData({pages:{}}), /locked/)
    assert.throws(()=>store.setProtection(dir,'wrong-password','unlock'))
    store.setProtection(dir,password,'unlock')
    assert.equal(store.loadData().data.pages.bio.cover, photo)
    assert.equal((await store.listVersions('bio'))[0].title,'Biology QA')
    assert.equal(store.readBackup(backup).pages.bio.cover,photo)
    store.setProtection(dir,password,'disable')
    store=restart()
    assert.equal(store.loadData().data.pages.bio.cover,photo)
    const primary=store.dataFile()
    fs.writeFileSync(primary,JSON.stringify({...sample,schema:999}))
    assert.throws(()=>store.loadData(),/newer/)
    assert.equal(JSON.parse(fs.readFileSync(primary)).schema,999)
    fs.writeFileSync(primary,'damaged')
    const newest=path.join(dir,'backups','broken.json')
    fs.writeFileSync(newest,'damaged');fs.utimesSync(newest,new Date(),new Date(Date.now()+10000))
    assert.equal(store.loadData().data.pages.bio.cover,photo)
    fs.renameSync(path.join(dir,'backups'),path.join(dir,'saved-snapshots'))
    fs.writeFileSync(primary,'preserve this unreadable data')
    assert.throws(()=>store.loadData(),/files have been kept/)
    assert.equal(fs.readFileSync(primary,'utf8'),'preserve this unreadable data')
    console.log('Skipped damaged backup, preserved unreadable and newer workspaces.')
    console.log('Schema migration, separate images, portable backups, history, password restart and recovery passed')
  } finally { fs.rmSync(profile,{recursive:true,force:true}) }
}
test().catch(e=>{console.error(e);process.exitCode=1})
