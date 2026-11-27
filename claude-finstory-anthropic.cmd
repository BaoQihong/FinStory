@echo off
REM ---------------------------------------------------------------------------
REM  claude-finstory-anthropic.cmd
REM
REM  Launch Claude Code in THIS directory (C:\project\finstory) against the
REM  DEFAULT Anthropic API and the standard Claude models, using only the
REM  project-local configuration:
REM
REM    .\CLAUDE.md                     - project instructions
REM    .\.claude\settings.json         - shared project settings (committed)
REM    .\.claude\settings.local.json   - personal overrides (git-ignored)
REM    .\.claude\agents\*.md           - subagent definitions
REM
REM  How it works:
REM    The Qwen wiring (ANTHROPIC_BASE_URL / ANTHROPIC_AUTH_TOKEN /
REM    ANTHROPIC_MODEL / ANTHROPIC_DEFAULT_*_MODEL / CLAUDE_CODE_SUBAGENT_*)
REM    lives in the "env" block of the USER settings file
REM    %USERPROFILE%\.claude\settings.json.
REM
REM    1. --setting-sources project,local  loads only .claude\settings.json and
REM       .claude\settings.local.json, skipping the user settings file, so its
REM       Qwen env block never applies.
REM    2. The set "VAR=" lines below unset the same variables in case they are
REM       inherited from the calling shell. In cmd, set "VAR=" removes VAR.
REM
REM  Subagents in .claude\agents use the standard aliases (haiku / sonnet /
REM  inherit), so under this launcher they run on real Claude models; under a
REM  plain `claude` session the user-level ANTHROPIC_DEFAULT_*_MODEL mapping
REM  still applies.
REM
REM  Authentication: uses the Claude login stored for this machine, or
REM  ANTHROPIC_API_KEY if set before launching.
REM
REM  Usage (any arguments are forwarded to claude verbatim):
REM    claude-finstory-anthropic.cmd                    interactive session
REM    claude-finstory-anthropic.cmd -c                 continue last session
REM    claude-finstory-anthropic.cmd --model opus       pin a specific model
REM    claude-finstory-anthropic.cmd -p "summarise docs" print mode
REM
REM  setlocal keeps the caller's environment and directory unchanged on exit.
REM ---------------------------------------------------------------------------

setlocal
cd /d "%~dp0"

REM Remove Qwen-endpoint variables possibly inherited from the calling shell
REM so Claude Code falls back to Anthropic defaults.
set "ANTHROPIC_BASE_URL="
set "ANTHROPIC_AUTH_TOKEN="
set "ANTHROPIC_MODEL="
set "ANTHROPIC_DEFAULT_HAIKU_MODEL="
set "ANTHROPIC_DEFAULT_SONNET_MODEL="
set "ANTHROPIC_DEFAULT_OPUS_MODEL="
set "CLAUDE_CODE_SUBAGENT_LIGHT_MODEL="
set "CLAUDE_CODE_SUBAGENT_MEDIUM_MODEL="

where claude >nul 2>nul
if errorlevel 1 (
  echo claude-finstory-anthropic: 'claude' was not found on PATH. 1>&2
  echo Install it with: winget install Anthropic.ClaudeCode 1>&2
  exit /b 1
)

claude --setting-sources project,local %*
set "RC=%ERRORLEVEL%"
endlocal & exit /b %RC%
