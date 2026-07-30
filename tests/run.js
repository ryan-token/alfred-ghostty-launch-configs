#!/usr/bin/env -S osascript -l JavaScript

// Black box tests. Both scripts are run the way Alfred runs them, with `configs_dir`
// pointing at a throwaway fixture folder, and asserted on their real output.
//
// Pass --integration to also drive Ghostty and check that a layout really opens.

ObjC.import('Foundation')
ObjC.import('AppKit')
ObjC.import('stdlib')

const app = Application.currentApplication()
app.includeStandardAdditions = true

const ARGUMENTS = ObjC.deepUnwrap($.NSProcessInfo.processInfo.arguments)
const INTEGRATION = ARGUMENTS.includes('--integration')

const scriptPath = ARGUMENTS.find(argument => argument.endsWith('tests/run.js'))
const ROOT = scriptPath
  ? $(scriptPath).stringByDeletingLastPathComponent.stringByDeletingLastPathComponent.js
  : $.NSFileManager.defaultManager.currentDirectoryPath.js

const GHOSTTY_INSTALLED = !$.NSWorkspace.sharedWorkspace
  .URLForApplicationWithBundleIdentifier('com.mitchellh.ghostty').isNil()

const quote = value => `'${value.replace(/'/g, `'\\''`)}'`

// Wrapping in a group with a trailing echo keeps a failing script from raising, so the
// exit status can be asserted on like any other output.
const shell = command => {
  // doShellScript separates lines with carriage returns rather than newlines.
  const lines = String(app.doShellScript(`{ ${command} ; } 2>&1; echo "__status:$?"`)).split(/\r|\n/)
  const marker = lines.pop()
  return { status: Number(marker.replace('__status:', '')), output: lines.join('\n') }
}

const runScript = (name, { args = '', env = {} } = {}) => {
  const assignments = Object.keys(env).map(key => `${key}=${quote(env[key])}`).join(' ')
  return shell(`cd ${quote(ROOT)} && ${assignments} ./${name} ${args}`)
}

const listItems = configsDir => {
  const result = runScript('list.js', { env: { configs_dir: configsDir } })
  if (result.status !== 0) throw new Error(`list.js exited ${result.status}: ${result.output}`)
  return JSON.parse(result.output).items
}

const manager = $.NSFileManager.defaultManager

const fixtures = []

const makeFixture = files => {
  const directory = shell('mktemp -d').output
  fixtures.push(directory)
  Object.keys(files).forEach(name => {
    $(files[name]).writeToFileAtomicallyEncodingError(`${directory}/${name}`, true, $.NSUTF8StringEncoding, null)
  })
  return directory
}

const removeFixtures = () => fixtures.forEach(directory => manager.removeItemAtPathError(directory, null))

const layout = value => JSON.stringify(value, null, 2)

let passed = 0
let failed = 0
let skipped = 0

const test = (name, body, { requiresGhostty = false } = {}) => {
  if (requiresGhostty && !GHOSTTY_INSTALLED) {
    skipped++
    console.log(`  skip  ${name} (Ghostty not installed)`)
    return
  }
  try {
    body()
    passed++
    console.log(`  ok    ${name}`)
  } catch (error) {
    failed++
    console.log(`  FAIL  ${name}`)
    console.log(`        ${error.message}`)
  }
}

const assertEqual = (actual, expected, label) => {
  const same = JSON.stringify(actual) === JSON.stringify(expected)
  if (!same) throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}

const assertContains = (actual, needle, label) => {
  if (!String(actual).includes(needle)) throw new Error(`${label}: expected to find ${JSON.stringify(needle)} in ${JSON.stringify(actual)}`)
}

console.log('list.js')

test('lists layouts sorted by file name', () => {
  const configs = makeFixture({
    'zebra.json': layout({ name: 'Zebra', tabs: [{ cwd: '~' }] }),
    'alpha.json': layout({ name: 'Alpha', tabs: [{ cwd: '~' }] }),
  })
  assertEqual(listItems(configs).map(item => item.title), ['Alpha', 'Zebra'], 'titles')
}, { requiresGhostty: true })

test('falls back to the file name when a layout has no name', () => {
  const configs = makeFixture({ 'my-project.json': layout({ tabs: [{ cwd: '~' }] }) })
  assertEqual(listItems(configs)[0].title, 'my-project', 'title')
}, { requiresGhostty: true })

test('describes a layout by its tab count when it has no description', () => {
  const cases = [
    { name: 'one tab', value: { tabs: [{ cwd: '~' }] }, expected: '1 tab' },
    { name: 'several tabs', value: { tabs: [{ cwd: '~' }, { cwd: '~' }, { cwd: '~' }] }, expected: '3 tabs' },
    {
      name: 'several windows',
      value: { windows: [{ tabs: [{ cwd: '~' }] }, { tabs: [{ cwd: '~' }] }] },
      expected: '2 tabs · 2 windows',
    },
    {
      name: 'splits',
      value: { tabs: [{ cwd: '~', splits: [{ direction: 'right' }, { direction: 'down' }] }] },
      expected: '1 tab · 2 splits',
    },
  ]

  cases.forEach(testCase => {
    const configs = makeFixture({ 'layout.json': layout(testCase.value) })
    assertEqual(listItems(configs)[0].subtitle, testCase.expected, testCase.name)
  })
}, { requiresGhostty: true })

test('prefers an explicit description over the summary', () => {
  const configs = makeFixture({ 'a.json': layout({ description: 'Everything', tabs: [{ cwd: '~' }] }) })
  assertEqual(listItems(configs)[0].subtitle, 'Everything', 'subtitle')
}, { requiresGhostty: true })

test('reports invalid JSON without hiding the other layouts', () => {
  const configs = makeFixture({
    'broken.json': '{ oops',
    'good.json': layout({ name: 'Good', tabs: [{ cwd: '~' }] }),
  })
  const items = listItems(configs)

  assertEqual(items.map(item => item.title), ['broken.json', 'Good'], 'titles')
  assertContains(items[0].subtitle, 'Invalid JSON', 'broken subtitle')
  assertEqual(items[0].variables.action, 'edit', 'broken item action')
}, { requiresGhostty: true })

test('reports a layout that is not a JSON object', () => {
  const configs = makeFixture({ 'array.json': '[]', 'null.json': 'null' })
  const items = listItems(configs)

  assertEqual(items.length, 2, 'item count')
  items.forEach(item => assertContains(item.subtitle, 'should contain a JSON object', item.title))
}, { requiresGhostty: true })

test('accepts a layouts folder with a trailing slash', () => {
  const configs = makeFixture({ 'a.json': layout({ name: 'Trailing', tabs: [{ cwd: '~' }] }) })
  assertEqual(listItems(`${configs}/`).map(item => item.title), ['Trailing'], 'titles')
}, { requiresGhostty: true })

test('ignores files that are not layouts', () => {
  const configs = makeFixture({
    'notes.txt': 'ignore me',
    'real.json': layout({ name: 'Real', tabs: [{ cwd: '~' }] }),
  })
  assertEqual(listItems(configs).map(item => item.title), ['Real'], 'titles')
}, { requiresGhostty: true })

test('offers to create the folder when it holds no layouts', () => {
  const items = listItems(makeFixture({}))
  assertEqual(items.length, 1, 'item count')
  assertEqual(items[0].variables.action, 'scaffold', 'action')
}, { requiresGhostty: true })

test('offers to create the folder when it does not exist', () => {
  const items = listItems(`${makeFixture({})}/not-created-yet`)
  assertEqual(items[0].variables.action, 'scaffold', 'action')
}, { requiresGhostty: true })

// Only reachable on a machine without Ghostty, which is the case in CI.
if (!GHOSTTY_INSTALLED) {
  test('reports a missing Ghostty instead of listing layouts', () => {
    const items = listItems(makeFixture({ 'a.json': layout({ tabs: [{ cwd: '~' }] }) }))
    assertContains(items[0].title, 'Ghostty is not installed', 'title')
    assertEqual(items[0].valid, false, 'valid')
  })
}

console.log('launch.js')

test('fails when no layout is given', () => {
  const result = runScript('launch.js')
  assertEqual(result.status !== 0, true, 'exit status')
  assertContains(result.output, 'No layout given', 'message')
})

test('fails when the layout file is missing', () => {
  const configs = makeFixture({})
  const result = runScript('launch.js', { args: 'nope', env: { configs_dir: configs } })
  assertEqual(result.status !== 0, true, 'exit status')
  assertContains(result.output, `No layout at ${configs}/nope.json`, 'message')
})

test('fails when a layout has neither windows nor tabs', () => {
  const configs = makeFixture({ 'empty.json': layout({ name: 'Empty' }) })
  const result = runScript('launch.js', { args: 'empty', env: { configs_dir: configs } })
  assertEqual(result.status !== 0, true, 'exit status')
  assertContains(result.output, 'needs a "windows" or a "tabs" array', 'message')
}, { requiresGhostty: true })

test('creates the layouts folder and an example when scaffolding', () => {
  const configs = `${makeFixture({})}/fresh`
  const result = runScript('launch.js', { env: { configs_dir: configs, action: 'scaffold' } })

  assertEqual(result.status, 0, 'exit status')
  assertEqual(manager.fileExistsAtPath(`${configs}/example.json`), true, 'example.json exists')

  const items = GHOSTTY_INSTALLED ? listItems(configs) : null
  if (items) assertEqual(items[0].title, 'Example', 'the example is listed')
})

test('keeps an existing example when scaffolding again', () => {
  const configs = makeFixture({ 'example.json': layout({ name: 'Mine', tabs: [{ cwd: '~' }] }) })
  runScript('launch.js', { env: { configs_dir: configs, action: 'scaffold' } })

  const contents = $.NSString.stringWithContentsOfFileEncodingError(
    `${configs}/example.json`, $.NSUTF8StringEncoding, null
  ).js
  assertContains(contents, '"Mine"', 'existing file kept')
})

if (INTEGRATION) {
  console.log('integration')

  test('opens a layout with titles, directories, splits and focus', () => {
    const marker = 'AGL Integration Fixture'
    const configs = makeFixture({
      'fixture.json': layout({
        name: 'Fixture',
        tabs: [
          {
            title: marker,
            cwd: '/tmp',
            splits: [
              { direction: 'right', cwd: '/usr/local' },
              { direction: 'down', cwd: '/etc' },
            ],
          },
          { title: 'Second', cwd: '/usr', focus: true },
        ],
      }),
    })

    const result = runScript('launch.js', { args: 'fixture', env: { configs_dir: configs } })
    assertEqual(result.status, 0, `exit status (${result.output})`)
    $.NSThread.sleepForTimeInterval(2.5)

    const ghostty = Application('Ghostty')
    const findWindow = () => ghostty.windows().find(candidate => candidate.tabs()[0].name() === marker)

    // Looked up again on the way out so the window is closed however the test ends.
    try {
      const window = findWindow()
      if (!window) throw new Error('the layout did not open a window')

      assertEqual(window.tabs().map(tab => tab.name()), [marker, 'Second'], 'tab titles')
      assertEqual(window.selectedTab().name(), 'Second', 'focused tab')

      // Splits chain, so the second one divides the pane the first one created.
      assertEqual(
        window.tabs()[0].terminals().map(terminal => terminal.workingDirectory()),
        ['/tmp', '/usr/local', '/etc'],
        'split working directories'
      )
      assertEqual(window.tabs()[1].focusedTerminal().workingDirectory(), '/usr', 'second tab directory')
    } finally {
      const stray = findWindow()
      if (stray) ghostty.closeWindow(stray)
    }
  }, { requiresGhostty: true })
} else {
  console.log('integration (skipped, pass --integration to run)')
}

removeFixtures()

console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped`)
$.exit(failed === 0 ? 0 : 1)
