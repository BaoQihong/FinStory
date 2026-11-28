These five records are the `deepseek-flash` config as first defined, with
`chat_template_kwargs: {enable_thinking: false}`. DeepSeek-V4.1-Flash ignores
that key and reasons anyway (up to the full budget, finish=length on A, D, E).
They are kept unchanged as evidence for that finding but are NOT the
thinking-off DeepSeek results. See results/diag-deepseek-thinking-2026-11-28.json;
the corrected config uses `chat_template_kwargs: {enable_thinking: false, thinking: false}`.
