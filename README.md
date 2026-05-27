# Panel Me

Panel Me is a VS Code side-panel launcher for script-driven workflows.

## Features

- **Launchers tab**
  - Add custom launchers with a name + script command.
  - Start/stop/remove each launcher independently.
  - Per-launcher runtime state: `starting`, `running`, `stopping`, `stopped`, `errored`.
  - PID tracking while running.
- **Logs tab**
  - Consolidated log stream from all launchers.
  - Filter logs by launcher.
  - Clear all logs or only a selected launcher's logs.
- Launchers are persisted in workspace state.

## Notes

- Scripts run with `shell: true` in the first workspace folder (or extension path if no folder is open).
- Output is captured in-memory for quick inspection in the panel.
