# XPath Helper — Web Runner (локальный сайт)

Небольшой локальный сайт, который **выполняет записанные сценарии** (экспорт **📤 JSON** из расширения) через **Python Playwright** и показывает результат в браузере.

## Запуск

1) Установите зависимости:

```bash
cd web-runner
./install.sh
```

2) Запустите сервер:

```bash
./run.sh
```

3) Откройте `http://127.0.0.1:8000`, загрузите JSON сценария, нажмите **Run**.

## Что поддерживается

- **Actions**: `navigate`, `click`, `click_if_exists`, `input`, `file_upload`, `wait`, `wait_for_element`, `assert`, `branch` (частично), `user_action` (пропускается)
- **Переменные**: подстановка `{{var}}` из `Variables JSON` и `baseUrl`
- **Артефакты**: сохраняются в `web-runner/outputs/<runId>/` (`input.json`, `log.txt`, `report.json`, `screenshots/`)

## Ограничения

- `user_action` в веб‑раннере не может “ждать пользователя”, поэтому только логируется и пропускается.
- `branch` в экспортированном JSON не содержит стабильных `id` шагов; веб‑раннер поддерживает только прыжки по номеру шага через `params.nextStep`/`params.nextElseStep` (если вы их используете).

## Безопасность (token)

По умолчанию раннер принимает запросы без токена. Если нужно закрыть API:

```bash
export XPATH_RUNNER_TOKEN="my-secret"
uvicorn app:app --reload --port 8000
```

Тогда расширение должно отправлять заголовок `x-runner-token: my-secret` (ключ хранится локально в storage расширения).

## CLI/CI запуск (без UI)

Можно запускать сценарий в CI как обычную команду (exit code 0/1). Артефакты пишутся в `web-runner/outputs/cli_<timestamp>/`.

Пример:

```bash
cd web-runner
./install.sh
./cli.py --scenario-id test1_20260317_102859 --headless --start-url "https://example.com"
echo $?
```

Data-driven:

```bash
./cli.py --scenario-id test1_20260317_102859 --headless --start-url "https://example.com" --data-file ../test_data/rows.json --stop-on-first-fail
```
