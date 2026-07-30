#!/usr/bin/env -S osascript -l JavaScript

ObjC.import('Foundation')
ObjC.import('AppKit')

const HOME = $.NSHomeDirectory().js
const DEFAULT_CONFIGS_DIR = '~/.config/alfred-ghostty-launch/configs'
const GHOSTTY_BUNDLE_ID = 'com.mitchellh.ghostty'
const MINIMUM_VERSION = [1, 3]

const STARTER_LAYOUT = `{
  "name": "Example",
  "description": "A starter layout. Edit it or replace it with your own.",
  "tabs": [
    { "title": "Home", "cwd": "~", "focus": true },
    { "title": "Downloads", "cwd": "~/Downloads" }
  ]
}
`

const env = name => {
  const value = $.NSProcessInfo.processInfo.environment.objectForKey(name)
  return value.isNil() ? '' : value.js
}

// Paths arrive from the folder picker or straight out of a layout file, so they are
// canonicalised before anything is joined onto them.
const expandPath = path => path.trim().replace(/^~(?=\/|$)/, HOME).replace(/(?!^)\/+$/, '')

const configsDir = () => expandPath(env('configs_dir') || DEFAULT_CONFIGS_DIR)

const ghosttyProblem = () => {
  const url = $.NSWorkspace.sharedWorkspace.URLForApplicationWithBundleIdentifier(GHOSTTY_BUNDLE_ID)
  if (url.isNil()) return 'Ghostty is not installed'

  const stored = $.NSBundle.bundleWithURL(url).infoDictionary.objectForKey('CFBundleShortVersionString')
  const version = stored.isNil() ? '' : stored.js
  const [major, minor] = version.split('.').map(Number)

  // Ghostty gained an AppleScript dictionary in 1.3; earlier builds cannot be driven at all.
  const supported = major > MINIMUM_VERSION[0] || (major === MINIMUM_VERSION[0] && minor >= MINIMUM_VERSION[1])
  if (supported) return null

  return `Ghostty ${version || '(unknown version)'} is too old, ${MINIMUM_VERSION.join('.')} or later is required`
}

const readLayout = target => {
  const path = target.endsWith('.json') ? expandPath(target) : `${configsDir()}/${target}.json`
  const contents = $.NSString.stringWithContentsOfFileEncodingError(path, $.NSUTF8StringEncoding, null)
  if (contents.isNil()) throw new Error(`No layout at ${path}`)

  const layout = JSON.parse(contents.js)
  if (layout === null || typeof layout !== 'object' || Array.isArray(layout)) {
    throw new Error(`${path} should contain a JSON object`)
  }
  return { path, layout }
}

const windowsOf = layout => {
  if (Array.isArray(layout.windows)) return layout.windows
  if (Array.isArray(layout.tabs)) return [{ tabs: layout.tabs }]
  throw new Error('Layout needs a "windows" or a "tabs" array')
}

const connect = () => {
  const app = Application('Ghostty')
  // `launch` starts Ghostty without the empty default window `activate` would open.
  if (!app.running()) app.launch()
  return app
}

const surface = (app, pane) => {
  const config = app.newSurfaceConfiguration()
  if (pane.cwd) config.initialWorkingDirectory = expandPath(pane.cwd)
  // Sent as input rather than as `command` so the shell outlives the command.
  if (pane.command) config.initialInput = `${pane.command}\n`
  return config
}

const openLayout = layout => {
  const app = connect()
  let focusTarget = null

  windowsOf(layout).forEach(windowSpec => {
    let window = null

    ;(windowSpec.tabs || []).forEach((tabSpec, index) => {
      let tab
      if (index === 0) {
        window = app.newWindow({ withConfiguration: surface(app, tabSpec) })
        tab = window.selectedTab()
      } else {
        tab = app.newTab({ in: window, withConfiguration: surface(app, tabSpec) })
      }

      // Each split divides the pane created before it, so they chain across the tab.
      let terminal = tab.focusedTerminal()
      ;(tabSpec.splits || []).forEach(splitSpec => {
        terminal = app.split(terminal, {
          direction: splitSpec.direction || 'right',
          withConfiguration: surface(app, splitSpec),
        })
      })

      if (tabSpec.title) {
        app.performAction(`set_tab_title:${tabSpec.title}`, { on: tab.focusedTerminal() })
      }
      if (!focusTarget || tabSpec.focus) focusTarget = { window, tab }
    })
  })

  if (focusTarget) {
    app.selectTab(focusTarget.tab)
    app.activateWindow(focusTarget.window)
    app.focus(focusTarget.tab.focusedTerminal())
  }
}

const reveal = path => {
  const workspace = $.NSWorkspace.sharedWorkspace
  const url = $.NSURL.fileURLWithPath(path)
  // Falls back to Finder when nothing on the machine claims .json files.
  if (!workspace.openURL(url)) workspace.activateFileViewerSelectingURLs($([url]))
}

const scaffold = () => {
  const directory = configsDir()
  const manager = $.NSFileManager.defaultManager
  manager.createDirectoryAtPathWithIntermediateDirectoriesAttributesError(directory, true, $(), null)

  const path = `${directory}/example.json`
  if (!manager.fileExistsAtPath(path)) {
    $(STARTER_LAYOUT).writeToFileAtomicallyEncodingError(path, true, $.NSUTF8StringEncoding, null)
  }
  reveal(path)
}

function run(argv) {
  const action = env('action')
  if (action === 'scaffold') return scaffold()

  const target = argv[0]
  if (!target) throw new Error('No layout given')

  const { path, layout } = readLayout(target)
  if (action === 'edit') return reveal(path)

  const problem = ghosttyProblem()
  if (problem) throw new Error(problem)

  openLayout(layout)
}
