# Ghostty Launch Configurations for Alfred

An [Alfred workflow](https://www.alfredapp.com/workflows/) that opens custom [Ghostty](https://ghostty.org) layouts. A layout describes windows, tabs, splits, working directories and startup commands, so one keyword can reopen a whole working setup.

The idea comes from Warp's [launch configurations](https://docs.warp.dev/terminal/sessions/launch-configurations) - now called [tab configs](https://docs.warp.dev/terminal/windows/tab-configs/). If you keep a set of projects you open together often, this saves rebuilding that arrangement by hand.

## Requirements

- Alfred 5 with the [Powerpack](https://www.alfredapp.com/powerpack/)
- Ghostty 1.3 or later

Ghostty 1.3 was the first release with an AppleScript dictionary, which is how this workflow creates windows, tabs and splits. Earlier versions cannot be driven this way, and the workflow tells you so rather than failing quietly.

## Install

Download the latest `.alfredworkflow` from [Releases](https://github.com/ryan-token/alfred-ghostty-launch-configs/releases) and double click it.

## Usage

Browse your layouts with the `layouts` keyword.

- <kbd>↩</kbd> Open the layout
- <kbd>⌘</kbd><kbd>↩</kbd> Edit that layout's file

On first run there are no layouts, so the workflow offers to create the folder for you with an example to edit.

Layouts can also be opened from a script or a hotkey using the `launch` external trigger:

```sh
osascript -e 'tell application "Alfred 5" to run trigger "launch" \
  in workflow "com.ryantoken.ghostty-launch" with argument "work"'
```

The argument is a layout's file name without the extension, or an absolute path to a JSON file.

## Layout format

One JSON file per layout, stored in your layouts folder. The file name is used as the display name unless the file sets one.

```json
{
  "name": "Work",
  "description": "Everything I open on a Monday",
  "tabs": [
    { "title": "API", "cwd": "~/code/api", "focus": true },
    { "title": "Web", "cwd": "~/code/web" }
  ]
}
```

| Field | Where | Meaning |
| --- | --- | --- |
| `name` | top level | Display name in Alfred. Defaults to the file name. |
| `description` | top level | Subtitle in Alfred. Defaults to a summary of the layout. |
| `tabs` | top level | Shorthand for a layout with a single window. |
| `windows` | top level | Use instead of `tabs` to open more than one window. |
| `title` | tab | Tab title. Leave it out to let the shell name the tab. |
| `cwd` | tab, split | Working directory. `~` is expanded. |
| `command` | tab, split | Command run at startup. The shell stays open afterwards. |
| `focus` | tab | Focus this tab once everything is open. Defaults to the first tab. |
| `splits` | tab | Panes to split off inside the tab. |
| `direction` | split | `right`, `left`, `down` or `up`. Defaults to `right`. |

Splits chain, so each one divides the pane created before it. Two `right` splits give three columns from left to right.

A layout using windows, splits and startup commands:

```json
{
  "name": "Review",
  "windows": [
    {
      "tabs": [
        {
          "title": "API",
          "cwd": "~/code/api",
          "command": "git status",
          "splits": [
            { "direction": "right", "cwd": "~/code/api" },
            { "direction": "down", "command": "btop" }
          ]
        }
      ]
    },
    { "tabs": [{ "title": "Notes", "cwd": "~/notes", "focus": true }] }
  ]
}
```

There are more in [`examples/`](examples).

If a layout file contains invalid JSON it still shows up in Alfred, with the parse error as its subtitle. Actioning it opens the file so you can fix it.

## Configuration

Open the workflow's configuration in Alfred to change:

- **Keyword**, `layouts` by default
- **Layouts Folder**, a folder picker defaulting to `~/.config/alfred-ghostty-launch/configs`

## Building from source

```sh
./build.sh
```

That writes `dist/alfred-ghostty-launch.alfredworkflow`. The icon is generated rather than stored as source art:

```sh
swift icon/make-icon.swift
```

The workflow is two [JXA](https://developer.apple.com/library/archive/documentation/LanguagesUtilities/Conceptual/MacAutomationScriptingGuide/) scripts and nothing else. `list.js` builds Alfred's result list, `launch.js` opens a layout. There is no build step for them, no dependencies to install, and no network access at any point.

JavaScript was chosen over AppleScript because the workflow reads JSON layouts and writes Alfred's JSON feed, neither of which AppleScript can do without shelling out to another tool. It still drives Ghostty through the same AppleScript dictionary underneath.

## Tests

```sh
./tests/run.js
```

The tests run both scripts the way Alfred runs them, against throwaway layout folders, and check what comes back. Nothing is mocked and nothing is imported, so they exercise the real contract rather than the internals.

Reading a layout folder needs Ghostty present, so those tests report as skipped when it is missing, which is what happens on CI. The missing Ghostty path is checked there instead.

Opening a layout is checked separately, because it drives Ghostty for real and opens a window before closing it again:

```sh
./tests/run.js --integration
```

That one is worth running after a Ghostty upgrade, since it is the only check that the AppleScript dictionary still behaves the way the workflow expects.

## License

MIT, see [LICENSE](LICENSE).
