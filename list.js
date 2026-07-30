#!/usr/bin/env -S osascript -l JavaScript

ObjC.import('Foundation')
ObjC.import('AppKit')

const HOME = $.NSHomeDirectory().js
const DEFAULT_CONFIGS_DIR = '~/.config/alfred-ghostty-launch/configs'
const GHOSTTY_BUNDLE_ID = 'com.mitchellh.ghostty'
const MINIMUM_VERSION = [1, 3]

const env = name => {
  const value = $.NSProcessInfo.processInfo.environment.objectForKey(name)
  return value.isNil() ? '' : value.js
}

// Paths arrive from the folder picker or straight out of a layout file, so they are
// canonicalised before anything is joined onto them.
const expandPath = path => path.trim().replace(/^~(?=\/|$)/, HOME).replace(/(?!^)\/+$/, '')

const CONFIGS_DIR = expandPath(env('configs_dir') || DEFAULT_CONFIGS_DIR)

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

const readText = path => {
  const contents = $.NSString.stringWithContentsOfFileEncodingError(path, $.NSUTF8StringEncoding, null)
  return contents.isNil() ? null : contents.js
}

const layoutFiles = () => {
  const names = $.NSFileManager.defaultManager.contentsOfDirectoryAtPathError(CONFIGS_DIR, null)
  if (names.isNil()) return null
  return ObjC.deepUnwrap(names).filter(name => name.endsWith('.json')).sort()
}

const count = (total, noun) => `${total} ${noun}${total === 1 ? '' : 's'}`

const summarize = layout => {
  const windows = Array.isArray(layout.windows) ? layout.windows : [{ tabs: layout.tabs || [] }]
  const tabs = windows.reduce((total, window) => total + (window.tabs || []).length, 0)
  const splits = windows.reduce((total, window) =>
    total + (window.tabs || []).reduce((sum, tab) => sum + (tab.splits || []).length, 0), 0)

  const parts = [count(tabs, 'tab')]
  if (windows.length > 1) parts.push(count(windows.length, 'window'))
  if (splits > 0) parts.push(count(splits, 'split'))
  return parts.join(' · ')
}

const brokenItem = (path, fileName, reason) => ({
  uid: path,
  title: fileName,
  subtitle: `${reason}. Press return to edit it`,
  arg: path,
  match: fileName,
  variables: { action: 'edit' },
})

const toItem = fileName => {
  const path = `${CONFIGS_DIR}/${fileName}`
  const contents = readText(path)
  if (contents === null) return brokenItem(path, fileName, 'Could not read this file')

  let layout
  try {
    layout = JSON.parse(contents)
  } catch (error) {
    return brokenItem(path, fileName, `Invalid JSON, ${error.message}`)
  }

  if (layout === null || typeof layout !== 'object' || Array.isArray(layout)) {
    return brokenItem(path, fileName, 'This file should contain a JSON object')
  }

  return {
    uid: path,
    title: layout.name || fileName.replace(/\.json$/, ''),
    subtitle: layout.description || summarize(layout),
    arg: path,
    match: `${layout.name || ''} ${fileName}`,
    mods: {
      cmd: { subtitle: `Edit ${fileName}`, variables: { action: 'edit' } },
    },
  }
}

const setupItem = () => ({
  title: 'No layouts yet',
  subtitle: `Press return to create ${CONFIGS_DIR} with an example layout`,
  arg: CONFIGS_DIR,
  variables: { action: 'scaffold' },
})

function run() {
  const problem = ghosttyProblem()
  if (problem) return JSON.stringify({ items: [{ title: problem, valid: false }] })

  const files = layoutFiles()
  const items = files === null || files.length === 0 ? [setupItem()] : files.map(toItem)

  return JSON.stringify({ items })
}
